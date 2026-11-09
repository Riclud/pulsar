import QtQuick

DragHandler {
    id: dragHandler

    required property Window view
    property var motion: null
    property string axis: "x"
    property real threshold: 96
    property real distance: 0

    target: null
    xAxis.enabled: axis === "x"
    yAxis.enabled: axis === "y"

    onActiveTranslationChanged: {
        if (!active)
            return;

        distance = axis === "x" ? activeTranslation.x : activeTranslation.y;

        if (axis === "x")
            motion.offsetX = distance;
        else
            motion.offsetY = distance;
    }

    onActiveChanged: {
        if (active) {
            motion.following = true;
            return;
        }

        const released = distance;

        motion.following = false;
        motion.offsetX = 0;
        motion.offsetY = 0;
        distance = 0;

        if (Math.abs(released) < threshold)
            return;

        const direction = axis === "x"
                ? (released > 0 ? "right" : "left")
                : (released > 0 ? "down" : "up");

        view.emitNodeEvent(motion.host.pulsarMeta.node, "dragRelease", {
            direction: direction,
            distance: Math.abs(released)
        });
    }
}
