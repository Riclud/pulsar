import QtQuick

Rectangle {
    id: clickableBox

    required property Window view
    property var pulsarMeta: null

    TapHandler {
        longPressThreshold: 0.5

        onTapped: {
            if (!view.hasEvent(clickableBox.pulsarMeta.node, "click"))
                return;

            view.tappedItems.push(clickableBox);
            Qt.callLater(view.flushTap);
        }

        onLongPressed: {
            if (view.hasEvent(clickableBox.pulsarMeta.node, "longPress"))
                view.emitEvent(clickableBox.pulsarMeta.node, "longPress");
        }
    }

    HoverHandler {
        id: clickableHover

        cursorShape: Qt.PointingHandCursor

        Component.onCompleted: view.trackHover(clickableHover)
    }
}
