import QtQuick

Canvas {
    id: canvasRoot

    required property Window view
    property var pulsarMeta: null
    property string drawSource: ""
    property var drawFunction: null
    property var params: ({})
    property bool animated: false
    property real fps: 0
    property real lastDrawAT: 0
    property real startedAT: Date.now()

    function setSource(source) {
        if (source === drawSource)
            return;

        drawSource = source;
        drawFunction = null;

        try {
            drawFunction = new Function("return (" + source + ")")();
        } catch (error) {
            console.error("[pulsar] Canvas draw must be an arrow function: " + error);
        }
    }

    onPaint: {
        if (!drawFunction)
            return;

        const context = getContext("2d");

        context.reset();

        try {
            drawFunction(context, {
                width: width,
                height: height,
                time: (Date.now() - startedAT) / 1000,
                params: params,
                colors: {
                    primary: String(view.themePrimary),
                    text: String(view.themeText),
                    textSecondary: String(view.themeTextSecondary),
                    background: String(view.themeBackground),
                    surface: String(view.themeSurface),
                    border: String(view.themeBorder)
                }
            });
        } catch (error) {
            drawFunction = null;
            console.error("[pulsar] Canvas draw failed, and it cannot read outer variables, so pass them through params: " + error);
        }
    }

    FrameAnimation {
        running: canvasRoot.animated && canvasRoot.visible && canvasRoot.drawFunction !== null
        onTriggered: {
            const now = Date.now();

            if (canvasRoot.fps > 0 && now - canvasRoot.lastDrawAT < 1000 / canvasRoot.fps - 4)
                return;

            canvasRoot.lastDrawAT = now;
            canvasRoot.requestPaint();
        }
    }
}
