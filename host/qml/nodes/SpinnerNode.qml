import QtQuick

Item {
    id: spinnerRoot

    required property Window view
    property var pulsarMeta: null
    property color spinnerColor: view.themePrimary
    property real spinnerValue: -1
    property real thickness: Math.max(2, width * 0.1)
    property int spinnerSize: 24

    width: spinnerSize
    height: spinnerSize
    implicitWidth: spinnerSize
    implicitHeight: spinnerSize

    Canvas {
        id: spinnerCanvas

        anchors.fill: parent
        rotation: 0
        onPaint: {
            const ctx = getContext("2d");
            const w = width;
            const h = height;
            const line = Math.min(Math.max(1, spinnerRoot.thickness), Math.min(w, h) / 2);
            const cx = w / 2;
            const cy = h / 2;
            const radius = Math.max(1, Math.min(w, h) / 2 - line);
            const start = -Math.PI / 2;
            const sweep = spinnerRoot.spinnerValue < 0
                    ? Math.PI * 1.5
                    : Math.PI * 2 * Math.max(0, Math.min(1, spinnerRoot.spinnerValue));

            ctx.clearRect(0, 0, w, h);
            ctx.beginPath();
            ctx.strokeStyle = spinnerRoot.spinnerColor;
            ctx.lineWidth = line;
            ctx.lineCap = "round";
            ctx.arc(cx, cy, radius, start, start + sweep);
            ctx.stroke();
        }

        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()

        RotationAnimation on rotation {
            running: spinnerRoot.spinnerValue < 0
            from: 0
            to: 360
            duration: 900
            loops: Animation.Infinite
        }
    }

    onSpinnerValueChanged: spinnerCanvas.requestPaint()
    onSpinnerColorChanged: spinnerCanvas.requestPaint()
    onThicknessChanged: spinnerCanvas.requestPaint()
    onSpinnerSizeChanged: spinnerCanvas.requestPaint()

    Component.onCompleted: spinnerCanvas.requestPaint()
}
