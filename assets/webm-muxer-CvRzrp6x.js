/**
 * 内嵌 Mini WebM Muxer (解决内网/离线无法加载插件的问题)
 * 支持 VP9 + AlphaMode = 1 (Unity 透明视频专用)
 */
class WebMMuxer {
    constructor(options) {
        this.target = options.target || 'buffer';
        this.width = options.video.width;
        this.height = options.video.height;
        this.alpha = options.video.alpha || false;
        this.codec = options.video.codec || 'V_VP9'; // 'V_VP8' or 'V_VP9'
        
        this.chunks = [];
        this.duration = 0;
    }

    addVideoChunk(chunk, meta) {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        this.chunks.push({
            data: data,
            isKey: chunk.type === 'key',
            timestamp: chunk.timestamp / 1000 // us -> ms
        });
        if (this.chunks.length > 0) {
            this.duration = this.chunks[this.chunks.length - 1].timestamp;
        }
    }

    finalize() {
        // 简单的 WebM 构建器：Header + Segment (Info + Tracks + 1 Cluster per Keyframe or just 1 Big Cluster)
        // 为了简化，我们使用一个大 Cluster (Unity 能读)
        
        const EBML = [
            { id: 0x1a45dfa3, data: [ // EBML Header
                { id: 0x4286, data: 1 }, // EBMLVersion
                { id: 0x42f7, data: 1 }, // EBMLReadVersion
                { id: 0x42f2, data: 4 }, // EBMLMaxIDLength
                { id: 0x42f3, data: 8 }, // EBMLMaxSizeLength
                { id: 0x4282, data: "webm" }, // DocType
                { id: 0x4287, data: 4 }, // DocTypeVersion
                { id: 0x4285, data: 2 }  // DocTypeReadVersion
            ]}
        ];

        const Segment = [
            { id: 0x1549a966, data: [ // Info
                { id: 0x2ad7b1, data: 1000000 }, // TimecodeScale (1ms)
                { id: 0x4d80, data: "SpineUniversal" }, // MuxingApp
                { id: 0x5741, data: "SpineUniversal" }, // WritingApp
                { id: 0x4489, data: this.duration } // Duration (float)
            ]},
            { id: 0x1654ae6b, data: [ // Tracks
                { id: 0xae, data: [ // TrackEntry
                    { id: 0xd7, data: 1 }, // TrackNumber
                    { id: 0x73c5, data: 1 }, // TrackUID
                    { id: 0x9c, data: 0 }, // FlagLacing
                    { id: 0x22b59c, data: "eng" }, // Language
                    { id: 0x86, data: this.codec }, // CodecID
                    { id: 0x83, data: 1 }, // TrackType (Video)
                    { id: 0xe0, data: [ // Video
                        { id: 0xb0, data: this.width }, // PixelWidth
                        { id: 0xba, data: this.height }, // PixelHeight
                        this.alpha ? { id: 0x53c0, data: 1 } : null // AlphaMode: 1 (Key for Unity!)
                    ].filter(x=>x)}
                ]}
            ]}
        ];

        // 构建 Cluster
        // 简单策略：所有帧放入一个 Cluster，或者按关键帧分。为了简单，放一个 Cluster (注意文件不要太大，否则 Seeking 慢)
        // 更好的策略：每个关键帧一个 Cluster
        
        const Clusters = [];
        let currentCluster = null;
        
        this.chunks.forEach(chunk => {
            // 如果是关键帧，或者是第一个帧，或者距离上一个 Cluster 太久(>30秒)，开新 Cluster
            // 这里简单点：只要是 Keyframe 就开新 Cluster，或者当前没有 Cluster
            if (chunk.isKey || !currentCluster) {
                if (currentCluster) Clusters.push(currentCluster);
                currentCluster = { 
                    id: 0x1f43b675, 
                    data: [ { id: 0xe7, data: Math.round(chunk.timestamp) } ] // Timecode
                };
            }
            
            // SimpleBlock
            // Format: VINT(TrackNum) + Int16(RelTime) + Flags + Data
            const relTime = Math.round(chunk.timestamp) - currentCluster.data[0].data;
            // 如果 relTime 超过 Int16 范围 (-32768~32767)，也需要强制开新 Cluster (未处理极长关键帧间隔)
            // 简单处理：如果 relTime 溢出，新建 Cluster (未实现，假设视频较短)
            
            const flags = chunk.isKey ? 0x80 : 0x00; // Keyframe flag
            
            // VINT(1) = 0x81
            currentCluster.data.push({
                id: 0xa3, // SimpleBlock
                data: [
                    0x81, // Track Number 1 (VINT)
                    (relTime >> 8) & 0xff, relTime & 0xff, // Timecode (Int16)
                    flags,
                    chunk.data // Frame Data
                ]
            });
        });
        if (currentCluster) Clusters.push(currentCluster);

        // 序列化 EBML
        const buffer = this.serialize([ ...EBML, { id: 0x18538067, data: [ ...Segment, ...Clusters ] } ]); // Segment ID
        return new Blob([buffer], { type: 'video/webm' });
    }

    serialize(nodes) {
        const parts = [];
        nodes.forEach(node => {
            if (!node) return;
            
            // ID
            let id = node.id;
            let idBytes = [];
            while (id > 0 || idBytes.length === 0) {
                idBytes.unshift(id & 0xff);
                id = id >>> 8;
            }
            parts.push(new Uint8Array(idBytes));
            
            // Data
            let data = node.data;
            if (Array.isArray(data)) {
                // Recursive
                const childData = this.serialize(data);
                data = childData;
            } else if (typeof data === 'string') {
                data = new TextEncoder().encode(data);
            } else if (typeof data === 'number') {
                // Float (Duration) or Int
                // 这里为了简单，除了 Duration 用 float，其他都当 Int/VINT 处理？
                // EBML 定义比较严格。
                // 这里的 data 我们假设如果是 number 且 id 是 Duration (0x4489)，则是 Float64
                if (node.id === 0x4489) {
                    const view = new DataView(new ArrayBuffer(8));
                    view.setFloat64(0, data); // Big Endian? EBML floats are big endian
                    data = new Uint8Array(view.buffer);
                } else {
                    // Int / Uint
                    let v = Math.floor(data);
                    let vBytes = [];
                    // 最小字节数
                    do {
                        vBytes.unshift(v & 0xff);
                        v = v >>> 8;
                    } while (v > 0);
                    data = new Uint8Array(vBytes);
                }
            }
            
            // Size (VINT)
            let size = data.byteLength;
            let sizePrefix = 0x80;
            let sizeLen = 1;
            while (size >= sizePrefix) { // VINT logic
                sizePrefix = sizePrefix >> 1; // 0x40, 0x20...
                sizeLen++; 
            }
            // Max size len 8
            // 简单实现：
            // VINT 编码:
            // 0xxxxxxx (0-127) width 1
            // 10xxxxxx xxxxxxxx (0-16383) width 2
            // ...
            // 其实 EBML size 也可以定长。我们写个简单的 VINT 生成器
            
            parts.push(this.encodeVINT(size));
            parts.push(data);
        });
        
        // Concat all
        let totalLen = parts.reduce((a, b) => a + b.byteLength, 0);
        let res = new Uint8Array(totalLen);
        let offset = 0;
        parts.forEach(p => {
            res.set(p, offset);
            offset += p.byteLength;
        });
        return res;
    }

    encodeVINT(value) {
        // value 是长度
        // 找到需要的字节数
        let length = 1;
        let limit = 127;
        while (value > limit && length < 8) {
            length++;
            limit = (limit << 7) | 0xff; // 不太对，VINT 每一位减去 marker
            // VINT ranges:
            // 1 byte: 0xxx xxxx -> 0..127 (marker 0x80)
            // 2 bytes: 01xx xxxx xxxxxxxx -> 0..16383 (marker 0x40)
            // ...
        }
        // 正确的阈值：
        // 1: 2^7 - 2 = 126 (reserved unknown size) -> 127 ok
        // 2: 2^14 - 2 
        
        const markers = [0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01];
        let bytes = [];
        
        // 暴力匹配长度
        if (value < (1<<7)-1) length = 1;
        else if (value < (1<<14)-1) length = 2;
        else if (value < (1<<21)-1) length = 3;
        else if (value < (1<<28)-1) length = 4;
        else length = 5; // 够用了
        
        let v = value;
        for (let i = 0; i < length; i++) {
            bytes.unshift(v & 0xff);
            v = v >>> 8;
        }
        bytes[0] |= markers[length-1];
        
        return new Uint8Array(bytes);
    }
}
