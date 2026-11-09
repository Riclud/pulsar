import QtQuick

Item {
    id: arrangeRoot

    property var pulsarMeta: null
    property string arrangeSource: ""
    property var arrangeFunction: null
    property var currentParams: ({})
    property var fromParams: ({})
    property var targetParams: ({})
    property real glideStartAT: 0
    property int glideDuration: 0
    property string glideCurve: "ease"
    property bool gliding: false
    property bool animated: false
    property real startedAT: Date.now()

    onWidthChanged: place()
    onHeightChanged: place()

    function setSource(source) {
        if (source === arrangeSource)
            return;

        arrangeSource = source;
        arrangeFunction = null;

        try {
            arrangeFunction = new Function("return (" + source + ")")();
        } catch (error) {
            console.error("[pulsar] Arrange must be given an arrow function: " + error);
        }
    }

    function setParams(next, duration, curve) {
        const hadParams = Object.keys(targetParams).length > 0;
        let moved = false;

        fromParams = Object.assign({}, currentParams);
        targetParams = next;
        glideCurve = curve;

        for (const key of Object.keys(next)) {
            if (typeof next[key] === "number" && hadParams && typeof fromParams[key] === "number" && fromParams[key] !== next[key])
                moved = true;
        }

        if (!moved || duration <= 0) {
            currentParams = Object.assign({}, next);
            gliding = false;
            return;
        }

        glideStartAT = Date.now();
        glideDuration = duration;
        gliding = true;
    }

    function glide() {
        if (!gliding)
            return;

        const part = Math.min(1, (Date.now() - glideStartAT) / glideDuration);
        const eased = glideCurve === "linear" ? part : 1 - Math.pow(1 - part, 3);
        const out = Object.assign({}, targetParams);

        for (const key of Object.keys(targetParams)) {
            if (typeof targetParams[key] === "number" && typeof fromParams[key] === "number")
                out[key] = fromParams[key] + (targetParams[key] - fromParams[key]) * eased;
        }

        currentParams = out;

        if (part >= 1)
            gliding = false;
    }

    function place() {
        if (!arrangeFunction)
            return;

        const kids = [];

        for (let i = 0; i < children.length; i++) {
            const meta = children[i].pulsarMeta;

            if (meta && meta.node && !meta.extra.discarded && meta.node.props.visible !== false)
                kids.push(children[i]);
        }

        const frame = {
            width: width,
            height: height,
            time: (Date.now() - startedAT) / 1000,
            params: currentParams
        };

        try {
            for (let i = 0; i < kids.length; i++) {
                const kid = kids[i];
                const placed = arrangeFunction(i, kids.length, frame);

                if (placed.x !== undefined)
                    kid.x = placed.x - kid.width / 2;
                if (placed.y !== undefined)
                    kid.y = placed.y - kid.height / 2;
                if (placed.scale !== undefined)
                    kid.scale = placed.scale;
                if (placed.rotation !== undefined)
                    kid.rotation = placed.rotation;
                if (placed.opacity !== undefined)
                    kid.opacity = placed.opacity;
                if (placed.z !== undefined)
                    kid.z = placed.z;
            }
        } catch (error) {
            arrangeFunction = null;
            console.error("[pulsar] Arrange failed, and it cannot read outer variables, so pass them through params: " + error);
        }
    }

    FrameAnimation {
        running: (arrangeRoot.animated || arrangeRoot.gliding) && arrangeRoot.visible && arrangeRoot.arrangeFunction !== null
        onTriggered: {
            arrangeRoot.glide();
            arrangeRoot.place();
        }
    }
}
