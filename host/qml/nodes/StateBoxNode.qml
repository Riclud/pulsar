import QtQuick

// A box or card with hover, pressed or disabled styling. NativeRenderer picks the colours;
// this item owns what QML does best: the colour transition and the pointer handlers.
Rectangle {
    id: stateBox

    required property Window view
    property var pulsarMeta: null
    property int pulsarColorMs: 0
    readonly property alias hoverHandler: stateHover
    readonly property alias pressHandler: statePress
    readonly property alias tapHandler: stateTap

    function inputChanged() {
        if (stateBox.pulsarMeta && view.nativeRenderer)
            view.nativeRenderer.stateInput(stateBox.pulsarMeta.node.path);
    }

    Behavior on color {
        enabled: stateBox.pulsarColorMs > 0

        ColorAnimation { duration: stateBox.pulsarColorMs }
    }

    Behavior on border.color {
        enabled: stateBox.pulsarColorMs > 0

        ColorAnimation { duration: stateBox.pulsarColorMs }
    }

    TapHandler {
        id: stateTap

        enabled: false
        longPressThreshold: 0.5

        onTapped: {
            if (!view.hasEvent(stateBox.pulsarMeta.node, "click"))
                return;

            view.tappedItems.push(stateBox);
            Qt.callLater(view.flushTap);
        }

        onLongPressed: {
            if (view.hasEvent(stateBox.pulsarMeta.node, "longPress"))
                view.emitEvent(stateBox.pulsarMeta.node, "longPress");
        }
    }

    HoverHandler {
        id: stateHover

        onHoveredChanged: stateBox.inputChanged()

        Component.onCompleted: view.trackHover(stateHover)
    }

    // Same rule as the press tracking of MotionNode: a press that drifted away is not held.
    PointHandler {
        id: statePress

        readonly property bool holding: active
                && Math.abs(point.scenePosition.x - point.scenePressPosition.x) < 12
                && Math.abs(point.scenePosition.y - point.scenePressPosition.y) < 12

        target: null

        onHoldingChanged: stateBox.inputChanged()
    }
}
