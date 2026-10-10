/* Debug overlays, slot/draw-order overrides, and the performance readout.
   Unsupported runtime fields are skipped. Overrides are reapplied after AnimationState.apply. */
(function () {
    var overrides = {};
    var pinned = null;
    var bound = null;
    var labels = [];
    var verts = [];
    var stats = {
        fps: 0, tris: 0, verts: 0, bones: 0, slots: 0,
        ik: 0, transform: 0, path: 0, physics: 0, draws: 0, textures: 0
    };
    var points = [];
    var fpsAcc = 0;
    var fpsN = 0;
    var lastTick = 0;
    var sampleAt = 0;

    function t(key) {
        return window.t ? window.t(key) : key;
    }

    function slotName(slot) {
        if (!slot) return "";
        if (slot.data && slot.data.name) return slot.data.name;
        return slot.name || "";
    }

    function attName(att) {
        if (!att) return "";
        return att.name || "";
    }

    function listNamed(skeleton, field) {
        if (!skeleton) return [];
        if (Array.isArray(skeleton[field])) return skeleton[field];
        var cap = field.charAt(0).toUpperCase() + field.slice(1);
        var getter = skeleton["get" + cap];
        if (typeof getter === "function") {
            try {
                var value = getter.call(skeleton);
                if (Array.isArray(value)) return value;
            } catch (e) {}
        }
        return [];
    }

    function physicsSupported(skeleton) {
        if (!skeleton) return false;
        return Array.isArray(skeleton.physicsConstraints) || typeof skeleton.getPhysicsConstraints === "function";
    }

    function kindOf(att) {
        if (!att) return "";
        if (att.endSlot) return "clip";
        if (att.lengths) return "path";
        if (att.triangles && att.hullLength != null) return "mesh";
        if (typeof att.computeWorldPosition === "function" && att.worldVerticesLength == null) return "point";
        if (att.worldVerticesLength != null && (att.bones || att.vertices) && !att.region) return "bbox";
        if (att.region || att.offset || typeof att.computeWorldVertices === "function") return "region";
        return "";
    }

    function attachmentOf(slot) {
        if (!slot) return null;
        if (slot.attachment) return slot.attachment;
        if (typeof slot.getAttachment === "function") {
            try { return slot.getAttachment(); } catch (e) {}
        }
        return null;
    }

    function ensureVerts(n) {
        if (verts.length < n) verts.length = n;
        return verts;
    }

    function worldFloats(att, slot, count) {
        if (!att || typeof att.computeWorldVertices !== "function" || count < 2) return 0;
        var buf = ensureVerts(Math.max(count, 8));
        if (att.worldVerticesLength != null) {
            try {
                att.computeWorldVertices(slot, 0, count, buf, 0, 2);
                return count;
            } catch (e) {}
        }
        try {
            att.computeWorldVertices(slot, buf, 0, 2);
            return 8;
        } catch (e2) {}
        try {
            if (slot && slot.bone) {
                att.computeWorldVertices(slot.bone, buf, 0, 2);
                return 8;
            }
        } catch (e3) {}
        return 0;
    }

    function pointWorld(att, slot) {
        if (!att || typeof att.computeWorldPosition !== "function" || !slot || !slot.bone) return null;
        var p = { x: 0, y: 0 };
        try {
            var out = att.computeWorldPosition(slot.bone, p) || p;
            if (out && isFinite(out.x) && isFinite(out.y)) return { x: out.x, y: out.y };
        } catch (e) {}
        return null;
    }

    function skinsOf(skeleton) {
        var data = skeleton && skeleton.data;
        if (!data) return [];
        if (Array.isArray(data.skins)) return data.skins;
        if (typeof data.getSkins === "function") {
            try { return data.getSkins() || []; } catch (e) {}
        }
        return [];
    }

    function namesForSlot(skeleton, slotIndex) {
        var names = [];
        var seen = {};
        function add(name) {
            if (!name || seen[name]) return;
            seen[name] = 1;
            names.push(name);
        }
        var skins = skinsOf(skeleton);
        for (var s = 0; s < skins.length; s++) {
            var skin = skins[s];
            if (!skin) continue;
            if (typeof skin.getAttachmentsForSlot === "function") {
                var entries = [];
                try { skin.getAttachmentsForSlot(slotIndex, entries); } catch (e) { entries = []; }
                for (var i = 0; i < entries.length; i++) add(entries[i] && entries[i].name);
            } else if (skin.attachments && skin.attachments[slotIndex]) {
                var map = skin.attachments[slotIndex];
                for (var key in map) {
                    if (Object.prototype.hasOwnProperty.call(map, key) && map[key]) add(key);
                }
            }
        }
        return names;
    }

    function findAttachment(skeleton, slotIndex, name) {
        if (!name) return null;
        if (typeof skeleton.getAttachment === "function") {
            try {
                var current = skeleton.getAttachment(slotIndex, name);
                if (current) return current;
            } catch (e) {}
        }
        var skins = skinsOf(skeleton);
        for (var i = 0; i < skins.length; i++) {
            var skin = skins[i];
            if (skin && typeof skin.getAttachment === "function") {
                try {
                    var att = skin.getAttachment(slotIndex, name);
                    if (att) return att;
                } catch (e2) {}
            }
        }
        return null;
    }

    function hexRgb(hex) {
        var h = (hex || "").replace("#", "");
        if (h.length < 6) return null;
        return [
            parseInt(h.slice(0, 2), 16) / 255,
            parseInt(h.slice(2, 4), 16) / 255,
            parseInt(h.slice(4, 6), 16) / 255
        ];
    }

    function applyOrder(skeleton, names) {
        var slots = skeleton.slots;
        var draw = skeleton.drawOrder;
        if (!draw || !slots) return;
        var byName = {};
        for (var i = 0; i < slots.length; i++) byName[slotName(slots[i])] = slots[i];
        var next = [];
        var used = [];
        function take(slot) {
            if (!slot || used.indexOf(slot) >= 0) return;
            used.push(slot);
            next.push(slot);
        }
        for (var n = 0; n < names.length; n++) take(byName[names[n]]);
        for (var s = 0; s < slots.length; s++) take(slots[s]);
        for (var d = 0; d < next.length; d++) draw[d] = next[d];
        draw.length = next.length;
    }

    function orderNames() {
        if (pinned) return pinned.slice();
        var skeleton = window.skeleton;
        var draw = skeleton && (skeleton.drawOrder || skeleton.slots);
        if (!draw) return [];
        var names = [];
        for (var i = 0; i < draw.length; i++) names.push(slotName(draw[i]));
        return names;
    }

    function fmt(n) {
        return typeof n === "number" && isFinite(n) ? n.toFixed(2) : null;
    }

    function constraintLabel(constraint) {
        var name = (constraint.data && constraint.data.name) || "";
        var bits = [];
        if (name) bits.push(name);
        var mix = fmt(constraint.mix);
        var rot = fmt(constraint.mixRotate != null ? constraint.mixRotate : constraint.rotateMix);
        var mx = fmt(constraint.mixX != null ? constraint.mixX : constraint.translateMix);
        var my = fmt(constraint.mixY != null ? constraint.mixY : constraint.scaleMix);
        if (mix != null) bits.push("mix " + mix);
        else {
            if (rot != null) bits.push("rot " + rot);
            if (mx != null) bits.push("x " + mx);
            if (my != null) bits.push("y " + my);
        }
        if (constraint.strength != null && constraint.damping != null) {
            var str = fmt(constraint.strength);
            var damp = fmt(constraint.damping);
            if (str != null) bits.push("str " + str);
            if (damp != null) bits.push("damp " + damp);
        } else if (constraint.softness) {
            var soft = fmt(constraint.softness);
            if (soft != null) bits.push("soft " + soft);
        }
        return bits.join(" ");
    }

    function boneXY(bone) {
        if (!bone || !isFinite(bone.worldX) || !isFinite(bone.worldY)) return null;
        return { x: bone.worldX, y: bone.worldY };
    }

    function pushLabel(x, y, text, color) {
        if (!isFinite(x) || !isFinite(y) || !text) return;
        labels.push({ x: x, y: y, text: text, color: color });
    }

    function strokePoly(ctx, buf, n, closed) {
        if (n < 4) return;
        ctx.beginPath();
        ctx.moveTo(buf[0], buf[1]);
        for (var i = 2; i < n; i += 2) ctx.lineTo(buf[i], buf[i + 1]);
        if (closed) ctx.closePath();
        ctx.stroke();
    }

    function cubic(ctx, x0, y0, cx1, cy1, cx2, cy2, x1, y1, steps, move) {
        if (move) ctx.moveTo(x0, y0);
        for (var i = 1; i <= steps; i++) {
            var t = i / steps;
            var u = 1 - t;
            var x = u * u * u * x0 + 3 * u * u * t * cx1 + 3 * u * t * t * cx2 + t * t * t * x1;
            var y = u * u * u * y0 + 3 * u * u * t * cy1 + 3 * u * t * t * cy2 + t * t * t * y1;
            ctx.lineTo(x, y);
        }
    }

    function strokePath(ctx, path, buf, n) {
        if (n < 8) {
            strokePoly(ctx, buf, n, !!path.closed);
            return;
        }
        ctx.beginPath();
        var x1 = buf[2];
        var y1 = buf[3];
        var x2 = 0;
        var y2 = 0;
        if (path.closed) {
            cubic(ctx, x1, y1, buf[0], buf[1], buf[n - 2], buf[n - 1], buf[n - 4], buf[n - 3], 8, true);
        } else {
            ctx.moveTo(x1, y1);
        }
        var limit = n - 4;
        for (var ii = 4; ii < limit; ii += 6) {
            x2 = buf[ii + 4];
            y2 = buf[ii + 5];
            cubic(ctx, x1, y1, buf[ii], buf[ii + 1], buf[ii + 2], buf[ii + 3], x2, y2, 8, false);
            x1 = x2;
            y1 = y2;
        }
        ctx.stroke();
    }

    function eachSlot(skeleton, fn) {
        var slots = skeleton.slots || [];
        for (var i = 0; i < slots.length; i++) fn(slots[i], i);
    }

    function visibleColor(slot) {
        return !slot.color || slot.color.a == null || slot.color.a > 0;
    }

    function measure(skeleton) {
        stats.tris = 0;
        stats.verts = 0;
        stats.draws = 0;
        stats.textures = 0;
        stats.bones = 0;
        stats.slots = 0;
        stats.ik = 0;
        stats.transform = 0;
        stats.path = 0;
        stats.physics = 0;
        points = [];
        if (!skeleton) return;
        stats.bones = skeleton.bones ? skeleton.bones.length : 0;
        stats.slots = skeleton.slots ? skeleton.slots.length : 0;
        stats.ik = listNamed(skeleton, "ikConstraints").length;
        stats.transform = listNamed(skeleton, "transformConstraints").length;
        stats.path = listNamed(skeleton, "pathConstraints").length;
        stats.physics = listNamed(skeleton, "physicsConstraints").length;
        var textures = [];
        eachSlot(skeleton, function (slot) {
            var att = attachmentOf(slot);
            if (!att || !visibleColor(slot)) {
                if (att && kindOf(att) === "point" && window.viewerConfig.debugPoints) {
                    var hiddenPoint = pointWorld(att, slot);
                    if (hiddenPoint) points.push({ name: slotName(slot) || attName(att), x: hiddenPoint.x, y: hiddenPoint.y });
                }
                return;
            }
            var kind = kindOf(att);
            if (kind === "region") {
                stats.tris += 2;
                stats.verts += 4;
                stats.draws += 1;
            } else if (kind === "mesh") {
                stats.tris += att.triangles ? Math.floor(att.triangles.length / 3) : 0;
                stats.verts += Math.floor((att.worldVerticesLength || 0) / 2);
                stats.draws += 1;
            } else if (kind === "point" && window.viewerConfig.debugPoints) {
                var p = pointWorld(att, slot);
                if (p) points.push({ name: slotName(slot) || attName(att), x: p.x, y: p.y });
            }
            var tex = att.region && att.region.texture;
            if (tex && textures.indexOf(tex) < 0) textures.push(tex);
        });
        stats.textures = textures.length;
    }

    function statRows() {
        return [
            [t("debug.fps"), Math.round(stats.fps)],
            [t("debug.trisCount"), stats.tris],
            [t("debug.verts"), stats.verts],
            [t("debug.bones"), stats.bones],
            [t("debug.slotsCount"), stats.slots],
            [t("debug.ik"), stats.ik],
            [t("debug.transform"), stats.transform],
            [t("debug.path"), stats.path],
            [t("debug.physicsCount"), stats.physics],
            [t("debug.draws"), stats.draws],
            [t("debug.textures"), stats.textures]
        ];
    }

    function fillStats(el, rows) {
        if (!el) return;
        el.replaceChildren();
        for (var i = 0; i < rows.length; i++) {
            var k = document.createElement("span");
            k.textContent = rows[i][0];
            var v = document.createElement("b");
            v.textContent = String(rows[i][1]);
            el.appendChild(k);
            el.appendChild(v);
        }
    }

    function paintPoints() {
        var el = document.getElementById("debug-point-readout");
        if (!el) return;
        el.replaceChildren();
        if (!window.viewerConfig.debugPoints) {
            el.textContent = t("debug.pointsIdle");
            return;
        }
        if (!points.length) {
            el.textContent = t("debug.pointsEmpty");
            return;
        }
        for (var i = 0; i < points.length; i++) {
            var row = document.createElement("div");
            var p = points[i];
            row.textContent = p.name + "  " + p.x.toFixed(1) + ", " + p.y.toFixed(1);
            el.appendChild(row);
        }
    }

    function paintStats() {
        var rows = statRows();
        var hud = document.getElementById("stats-hud");
        if (hud) {
            hud.classList.toggle("on", !!(window.viewerConfig && window.viewerConfig.showStats));
            fillStats(hud, rows);
        }
        fillStats(document.getElementById("debug-stats-readout"), rows);
        paintPoints();
    }

    function emptyNote(el, key) {
        el.replaceChildren();
        var p = document.createElement("p");
        p.className = "debug-hint";
        p.textContent = t(key);
        el.appendChild(p);
    }

    function restoreSlot(slot) {
        if (!slot) return;
        if (typeof slot.setToSetupPose === "function") {
            try { slot.setToSetupPose(); return; } catch (e) {}
        }
        var color = slot.data && slot.data.color;
        if (slot.color && color) {
            slot.color.r = color.r;
            slot.color.g = color.g;
            slot.color.b = color.b;
            slot.color.a = color.a;
        }
    }

    function buildSlots() {
        var el = document.getElementById("debug-slot-list");
        if (!el) return;
        var skeleton = window.skeleton;
        if (!skeleton || !skeleton.slots || !skeleton.slots.length) {
            emptyNote(el, "debug.slotEmpty");
            return;
        }
        el.replaceChildren();
        for (var i = 0; i < skeleton.slots.length; i++) {
            var slot = skeleton.slots[i];
            var name = slotName(slot) || ("#" + i);
            var o = overrides[name] || {};
            var row = document.createElement("div");
            row.className = "debug-slot";
            row.setAttribute("data-slot", name);
            row.setAttribute("data-index", String(i));

            var vis = document.createElement("input");
            vis.type = "checkbox";
            vis.className = "debug-vis";
            vis.checked = !o.hidden;
            vis.title = t("debug.visible");

            var label = document.createElement("span");
            label.className = "debug-name";
            label.textContent = name;
            label.title = name;

            var tint = document.createElement("input");
            tint.type = "color";
            tint.className = "debug-tint";
            tint.value = o.tint || "#ffffff";
            tint.title = t("debug.tint");

            row.appendChild(vis);
            row.appendChild(label);
            row.appendChild(tint);

            var names = namesForSlot(skeleton, i);
            if (names.length > 1) {
                var sel = document.createElement("select");
                sel.className = "debug-att";
                var follow = document.createElement("option");
                follow.value = "";
                follow.textContent = t("debug.follow");
                sel.appendChild(follow);
                for (var n = 0; n < names.length; n++) {
                    var opt = document.createElement("option");
                    opt.value = names[n];
                    opt.textContent = names[n];
                    sel.appendChild(opt);
                }
                sel.value = o.attachment || "";
                row.appendChild(sel);
            }
            el.appendChild(row);
        }
    }

    function buildOrder() {
        var el = document.getElementById("debug-order-list");
        if (!el) return;
        var skeleton = window.skeleton;
        if (!skeleton || !skeleton.slots || !skeleton.slots.length) {
            emptyNote(el, "debug.slotEmpty");
            return;
        }
        var names = orderNames();
        el.replaceChildren();
        for (var view = names.length - 1; view >= 0; view--) {
            var name = names[view];
            var row = document.createElement("div");
            row.className = "debug-order";
            var label = document.createElement("span");
            label.textContent = name;
            label.title = name;
            var front = document.createElement("button");
            front.type = "button";
            front.textContent = t("debug.toFront");
            front.setAttribute("data-name", name);
            front.setAttribute("data-dir", "1");
            front.disabled = view === names.length - 1;
            var back = document.createElement("button");
            back.type = "button";
            back.textContent = t("debug.toBack");
            back.setAttribute("data-name", name);
            back.setAttribute("data-dir", "-1");
            back.disabled = view === 0;
            row.appendChild(label);
            row.appendChild(front);
            row.appendChild(back);
            el.appendChild(row);
        }
    }

    function syncPhysics() {
        var row = document.getElementById("debug-physics-row");
        var note = document.getElementById("debug-physics-note");
        var skeleton = window.skeleton;
        var ok = physicsSupported(skeleton);
        if (row) row.hidden = !ok;
        if (note) note.hidden = !skeleton || ok;
        if (!ok && window.viewerConfig) {
            window.viewerConfig.debugPhysics = false;
            var box = document.getElementById("chk-debug-physics");
            if (box) box.checked = false;
        }
    }

    function drawMeshes(ctx, skeleton, zoom) {
        var cfg = window.viewerConfig;
        eachSlot(skeleton, function (slot) {
            var att = attachmentOf(slot);
            if (!att || !visibleColor(slot)) return;
            var kind = kindOf(att);
            if (kind === "region") {
                var n = worldFloats(att, slot, 8);
                if (n < 8) return;
                ctx.lineWidth = 1.25 / zoom;
                if (cfg.debugMesh || cfg.debugHull) {
                    ctx.strokeStyle = "#7ee0ff";
                    strokePoly(ctx, verts, 8, true);
                }
                if (cfg.debugTris) {
                    ctx.strokeStyle = "rgba(126,224,255,0.75)";
                    ctx.beginPath();
                    ctx.moveTo(verts[0], verts[1]);
                    ctx.lineTo(verts[2], verts[3]);
                    ctx.lineTo(verts[4], verts[5]);
                    ctx.closePath();
                    ctx.moveTo(verts[4], verts[5]);
                    ctx.lineTo(verts[6], verts[7]);
                    ctx.lineTo(verts[0], verts[1]);
                    ctx.closePath();
                    ctx.stroke();
                }
                return;
            }
            if (kind !== "mesh") return;
            var count = att.worldVerticesLength || 0;
            if (worldFloats(att, slot, count) < 4) return;
            ctx.lineWidth = 1.1 / zoom;
            if (cfg.debugTris && att.triangles) {
                ctx.strokeStyle = "rgba(126,224,255,0.8)";
                ctx.beginPath();
                var tris = att.triangles;
                for (var i = 0; i + 2 < tris.length; i += 3) {
                    var a = tris[i] * 2;
                    var b = tris[i + 1] * 2;
                    var c = tris[i + 2] * 2;
                    if (c + 1 >= count) continue;
                    ctx.moveTo(verts[a], verts[a + 1]);
                    ctx.lineTo(verts[b], verts[b + 1]);
                    ctx.lineTo(verts[c], verts[c + 1]);
                    ctx.closePath();
                }
                ctx.stroke();
            }
            var hull = att.hullLength || 0;
            if ((cfg.debugHull || cfg.debugMesh) && hull > 0) {
                ctx.strokeStyle = cfg.debugHull ? "#ffe14a" : "#7ee0ff";
                ctx.lineWidth = (cfg.debugHull ? 1.6 : 1.1) / zoom;
                var hn = (hull >> 1) * 2;
                if (hn > count) hn = count - (count % 2);
                strokePoly(ctx, verts, hn, true);
            }
        });
    }

    function drawBounds(ctx, skeleton, zoom) {
        eachSlot(skeleton, function (slot) {
            var att = attachmentOf(slot);
            if (!att || kindOf(att) !== "bbox") return;
            var n = worldFloats(att, slot, att.worldVerticesLength || 0);
            if (n < 4) return;
            ctx.strokeStyle = "#c6f54e";
            ctx.lineWidth = 1.4 / zoom;
            strokePoly(ctx, verts, n, true);
        });
        if (typeof skeleton.getBounds !== "function") return;
        try {
            var offset = { x: 0, y: 0, set: function (x, y) { this.x = x; this.y = y; } };
            var size = { x: 0, y: 0, set: function (x, y) { this.x = x; this.y = y; } };
            skeleton.getBounds(offset, size, []);
            if (!(size.x > 0) || !(size.y > 0)) return;
            ctx.save();
            ctx.setLineDash([8 / zoom, 4 / zoom]);
            ctx.strokeStyle = "rgba(183,245,106,0.95)";
            ctx.lineWidth = 1.2 / zoom;
            ctx.strokeRect(offset.x, offset.y, size.x, size.y);
            ctx.restore();
        } catch (e) {}
    }

    function drawPaths(ctx, skeleton, zoom) {
        eachSlot(skeleton, function (slot) {
            var att = attachmentOf(slot);
            if (!att || kindOf(att) !== "path") return;
            var n = worldFloats(att, slot, att.worldVerticesLength || 0);
            if (n < 4) return;
            ctx.strokeStyle = "#ff9f43";
            ctx.lineWidth = 1.5 / zoom;
            strokePath(ctx, att, verts, n);
            var label = slotName(slot) || attName(att);
            pushLabel(verts[2] || verts[0], verts[3] || verts[1], label, "#ff9f43");
        });
    }

    function drawClips(ctx, skeleton, zoom) {
        eachSlot(skeleton, function (slot) {
            var att = attachmentOf(slot);
            if (!att || kindOf(att) !== "clip") return;
            var n = worldFloats(att, slot, att.worldVerticesLength || 0);
            if (n < 4) return;
            ctx.save();
            ctx.setLineDash([5 / zoom, 3 / zoom]);
            ctx.strokeStyle = "#ff4d6a";
            ctx.lineWidth = 1.5 / zoom;
            strokePoly(ctx, verts, n, true);
            ctx.restore();
            pushLabel(verts[0], verts[1], slotName(slot) || attName(att), "#ff4d6a");
        });
    }

    function linkBones(ctx, bones, target, zoom, color) {
        var tip = boneXY(target);
        if (!tip || !bones) return tip;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.4 / zoom;
        ctx.beginPath();
        for (var i = 0; i < bones.length; i++) {
            var p = boneXY(bones[i]);
            if (!p) continue;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(tip.x, tip.y);
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 4 / zoom, 0, Math.PI * 2);
        ctx.stroke();
        return tip;
    }

    function drawConstraints(ctx, skeleton, zoom) {
        var color = "#d08bff";
        var groups = [
            listNamed(skeleton, "ikConstraints"),
            listNamed(skeleton, "transformConstraints"),
            listNamed(skeleton, "pathConstraints")
        ];
        for (var g = 0; g < groups.length; g++) {
            var list = groups[g];
            for (var i = 0; i < list.length; i++) {
                var c = list[i];
                var target = c.target;
                var tipBone = target && target.bone ? target.bone : target;
                var tip = linkBones(ctx, c.bones, tipBone, zoom, color);
                if (tip) pushLabel(tip.x, tip.y, constraintLabel(c), color);
            }
        }
    }

    function drawPhysics(ctx, skeleton, zoom) {
        if (!physicsSupported(skeleton)) return;
        var list = listNamed(skeleton, "physicsConstraints");
        var color = "#7dffb3";
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5 / zoom;
        for (var i = 0; i < list.length; i++) {
            var c = list[i];
            var bone = null;
            try { bone = c.bone; } catch (e) { bone = c._bone || null; }
            var p = boneXY(bone);
            if (!p) continue;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 7 / zoom, 0, Math.PI * 2);
            ctx.stroke();
            pushLabel(p.x, p.y, constraintLabel(c), color);
        }
    }

    function drawPoints(ctx, skeleton, zoom) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.4 / zoom;
        eachSlot(skeleton, function (slot) {
            var att = attachmentOf(slot);
            if (!att || kindOf(att) !== "point") return;
            var p = pointWorld(att, slot);
            if (!p) return;
            var s = 6 / zoom;
            ctx.beginPath();
            ctx.moveTo(p.x - s, p.y);
            ctx.lineTo(p.x + s, p.y);
            ctx.moveTo(p.x, p.y - s);
            ctx.lineTo(p.x, p.y + s);
            ctx.stroke();
            pushLabel(p.x, p.y, (slotName(slot) || attName(att)) + " " + p.x.toFixed(1) + "," + p.y.toFixed(1), "#ffffff");
        });
    }

    var api = {
        stats: stats,
        wantsOverlay: function () {
            var c = window.viewerConfig;
            return !!(c && (c.debugMesh || c.debugTris || c.debugHull || c.debugBounds || c.debugPaths || c.debugClip || c.debugConstraints || c.debugPhysics || c.debugPoints));
        },
        tick: function (skeleton) {
            var next = skeleton || null;
            if (next !== bound) api.refresh();
            var now = (window.performance && performance.now) ? performance.now() : Date.now();
            if (lastTick) {
                var dt = now - lastTick;
                if (dt > 0 && dt < 1000) {
                    fpsAcc += 1000 / dt;
                    fpsN += 1;
                }
            }
            lastTick = now;
            if (!sampleAt || now - sampleAt > 250) {
                stats.fps = fpsN ? fpsAcc / fpsN : stats.fps;
                fpsAcc = 0;
                fpsN = 0;
                sampleAt = now;
                measure(skeleton);
                paintStats();
            }
        },
        afterApply: function (skeleton) {
            if (!skeleton || !skeleton.slots) return;
            for (var i = 0; i < skeleton.slots.length; i++) {
                var slot = skeleton.slots[i];
                var o = overrides[slotName(slot)];
                if (!o) continue;
                if (o.attachment) {
                    var att = findAttachment(skeleton, i, o.attachment);
                    if (att && typeof slot.setAttachment === "function") {
                        try { slot.setAttachment(att); } catch (e) {}
                    }
                }
                if (slot.color) {
                    if (o.tint) {
                        var rgb = hexRgb(o.tint);
                        if (rgb) {
                            slot.color.r = rgb[0];
                            slot.color.g = rgb[1];
                            slot.color.b = rgb[2];
                        }
                    }
                    if (o.hidden) slot.color.a = 0;
                }
            }
            if (pinned) applyOrder(skeleton, pinned);
        },
        drawWorld: function (ctx, skeleton, zoom) {
            labels = [];
            var z = zoom || 1;
            ctx.save();
            ctx.lineJoin = "round";
            ctx.lineCap = "round";
            try {
                var c = window.viewerConfig;
                if (c.debugMesh || c.debugTris || c.debugHull) drawMeshes(ctx, skeleton, z);
                if (c.debugBounds) drawBounds(ctx, skeleton, z);
                if (c.debugPaths) drawPaths(ctx, skeleton, z);
                if (c.debugClip) drawClips(ctx, skeleton, z);
                if (c.debugConstraints) drawConstraints(ctx, skeleton, z);
                if (c.debugPhysics) drawPhysics(ctx, skeleton, z);
                if (c.debugPoints) drawPoints(ctx, skeleton, z);
            } catch (e) {}
            ctx.setLineDash([]);
            ctx.restore();
        },
        drawLabels: function (ctx, canvas, skeleton, camX, camY, zoom) {
            if (!labels.length || !canvas) return;
            ctx.save();
            ctx.font = "11px ui-monospace, monospace";
            ctx.lineWidth = 3;
            ctx.lineJoin = "round";
            var n = Math.min(labels.length, 48);
            for (var i = 0; i < n; i++) {
                var lab = labels[i];
                var sx = canvas.width / 2 + (lab.x - camX) * zoom;
                var sy = canvas.height / 2 - (lab.y - camY) * zoom;
                ctx.strokeStyle = "rgba(0,0,0,0.78)";
                ctx.strokeText(lab.text, sx + 8, sy - 8);
                ctx.fillStyle = lab.color || "#ffffff";
                ctx.fillText(lab.text, sx + 8, sy - 8);
            }
            ctx.restore();
        },
        refresh: function () {
            var skeleton = window.skeleton || null;
            if (skeleton !== bound) {
                bound = skeleton;
                overrides = {};
                pinned = null;
            }
            buildSlots();
            buildOrder();
            syncPhysics();
            paintStats();
        },
        resetSlots: function () {
            var skeleton = window.skeleton;
            if (skeleton && skeleton.slots) {
                for (var i = 0; i < skeleton.slots.length; i++) {
                    if (overrides[slotName(skeleton.slots[i])]) restoreSlot(skeleton.slots[i]);
                }
            }
            overrides = {};
            buildSlots();
        },
        resetOrder: function () {
            pinned = null;
            var skeleton = window.skeleton;
            if (skeleton && skeleton.slots && skeleton.drawOrder) {
                var slots = skeleton.slots;
                var draw = skeleton.drawOrder;
                for (var i = 0; i < slots.length; i++) draw[i] = slots[i];
                draw.length = slots.length;
            }
            buildOrder();
        },
        paintStats: paintStats
    };

    window.debugTools = api;

    function bindLists() {
        var slots = document.getElementById("debug-slot-list");
        var order = document.getElementById("debug-order-list");
        if (slots) {
            slots.addEventListener("change", function (e) {
                var row = e.target.closest && e.target.closest("[data-slot]");
                if (!row) return;
                var name = row.getAttribute("data-slot");
                var o = overrides[name] || {};
                if (e.target.classList.contains("debug-vis")) {
                    o.hidden = !e.target.checked;
                    if (!o.hidden && window.skeleton && window.skeleton.slots) {
                        restoreSlot(window.skeleton.slots[parseInt(row.getAttribute("data-index"), 10)]);
                    }
                } else if (e.target.classList.contains("debug-tint")) o.tint = e.target.value;
                else if (e.target.classList.contains("debug-att")) o.attachment = e.target.value || null;
                if (!o.hidden && !o.tint && !o.attachment) delete overrides[name];
                else overrides[name] = o;
            });
        }
        if (order) {
            order.addEventListener("click", function (e) {
                var btn = e.target.closest && e.target.closest("button[data-dir]");
                if (!btn || btn.disabled) return;
                var name = btn.getAttribute("data-name");
                var dir = parseInt(btn.getAttribute("data-dir"), 10);
                var names = orderNames();
                var i = names.indexOf(name);
                var j = i + dir;
                if (i < 0 || j < 0 || j >= names.length) return;
                var tmp = names[i];
                names[i] = names[j];
                names[j] = tmp;
                pinned = names;
                buildOrder();
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            bindLists();
            api.refresh();
        });
    } else {
        bindLists();
        api.refresh();
    }
})();
