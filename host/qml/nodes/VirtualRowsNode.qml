import QtQuick
import Pulsar.Native

// Rows drawn by the app. Only the rows near the viewport exist; the app is told which rows
// are visible and sends the ones to keep.
Flickable {
    id: rowsFlick

    required property Window view
    property var pulsarMeta: null
    property var nodeData: null
    property real rowHeight: 56
    property int rowCount: 0
    property int firstRow: 0
    property alias rows: rowsHost
    property int reportedFirst: -1
    property int reportedLast: -1

    clip: true
    boundsBehavior: Flickable.StopAtBounds
    maximumFlickVelocity: 8000
    contentWidth: width
    contentHeight: rowCount * rowHeight

    Inertia {
        renderer: rowsFlick.view
        flick: rowsFlick
    }

    Item {
        id: rowsHost

        y: rowsFlick.firstRow * rowsFlick.rowHeight
        width: rowsFlick.width
        height: rowsFlick.contentHeight - y
        property var pulsarMeta: null
    }

    function report() {
        if (!nodeData || rowHeight <= 0 || rowCount === 0)
            return;

        const first = Math.max(0, Math.floor(contentY / rowHeight));
        const last = Math.min(rowCount - 1, Math.max(first, Math.ceil((contentY + height) / rowHeight) - 1));

        if (first === reportedFirst && last === reportedLast)
            return;

        reportedFirst = first;
        reportedLast = last;
        view.emitNodeEvent(nodeData, "range", { first: first, last: last });
    }

    // One report per frame, however many things moved.
    function scheduleReport() {
        Qt.callLater(report);
    }

    onContentYChanged: scheduleReport()
    onHeightChanged: scheduleReport()
    onRowCountChanged: scheduleReport()
    Component.onCompleted: scheduleReport()
}
