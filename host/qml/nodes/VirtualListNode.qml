import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: vlistRoot

    required property Window view
    property var pulsarMeta: null
    property var nodeData: null
    property alias listView: vlist
    property alias stickyHeader: stickyHeader
    property alias stickyLabel: stickyLabel

    ListView {
        id: vlist

        anchors.fill: parent
        clip: true
        boundsBehavior: Flickable.DragOverBounds
        property var nodeData: vlistRoot.nodeData
        property var items: []
        property var selectedKeys: []
        property var swipeActions: []
        property var sectionForIndex: []
        property bool selectable: false
        property bool reorderable: false
        property bool refreshable: false
        property bool stickySections: false
        property real actionWidth: swipeActions.length * 72
        property int padding: 0
        property string currentSection: ""
        property bool endReached: false

        model: items
        reuseItems: true
        maximumFlickVelocity: 8000

        Inertia {
            renderer: view
            flick: vlist
        }

        topMargin: padding
        bottomMargin: padding
        add: Transition {
            NumberAnimation {
                property: "opacity"
                from: 0
                to: 1
                duration: Math.round(view.motionFast * 0.6)
            }
        }
        remove: Transition {
            NumberAnimation {
                property: "opacity"
                to: 0
                duration: Math.round(view.motionFast * 0.6)
            }
        }
        move: Transition {
            NumberAnimation {
                property: "y"
                duration: view.motionFast
                easing.type: Easing.BezierSpline
                easing.bezierCurve: view.motionCurve
            }
        }
        moveDisplaced: Transition {
            NumberAnimation {
                property: "y"
                duration: view.motionFast
                easing.type: Easing.BezierSpline
                easing.bezierCurve: view.motionCurve
            }
        }

        function keyOf(index) {
            const item = items[index];

            if (!item)
                return index;

            return item.key !== undefined ? item.key : index;
        }

        function isSelected(index) {
            return selectedKeys.indexOf(keyOf(index)) >= 0;
        }

        function updateSticky() {
            if (!stickySections)
                return;

            const index = indexAt(1, contentY + 1);
            const section = index >= 0 && index < sectionForIndex.length ? sectionForIndex[index] : "";

            if (section !== currentSection)
                currentSection = section;
        }

        function checkEnd() {
            if (endReached || !view.hasEvent(nodeData, "endReached"))
                return;
            if (contentHeight <= height + 80)
                return;
            if (contentY + height < contentHeight - 80)
                return;

            endReached = true;
            view.emitNodeEvent(nodeData, "endReached");
        }

        onContentYChanged: {
            updateSticky();
            checkEnd();
        }

        onMovementEnded: {
            if (refreshable && contentY < -60) {
                contentY = 0;

                if (view.hasEvent(nodeData, "refresh"))
                    view.emitNodeEvent(nodeData, "refresh");

                return;
            }

            checkEnd();
        }

        onCountChanged: {
            endReached = false;
            updateSticky();
        }

        delegate: Item {
            id: row

            width: vlist.width
            height: rowColumn.implicitHeight
            property var rowData: modelData
            property int rowIndex: index

            Row {
                id: swipeRow

                anchors.right: parent.right
                anchors.top: parent.top
                height: row.height
                spacing: 0

                Repeater {
                    model: vlist.swipeActions

                    Rectangle {
                        width: 72
                        height: row.height
                        color: view.resolveColor(modelData.color, "#b3261e")

                        Column {
                            anchors.centerIn: parent
                            spacing: 2

                            Label {
                                anchors.horizontalCenter: parent.horizontalCenter
                                text: modelData.icon !== undefined ? modelData.icon : ""
                                visible: text.length > 0
                                font.family: view.iconFamily
                                font.pixelSize: view.fs(20)
                                color: "#ffffff"
                            }

                            Label {
                                anchors.horizontalCenter: parent.horizontalCenter
                                text: modelData.label !== undefined ? modelData.label : modelData.id
                                color: "#ffffff"
                                font.pixelSize: view.fs(11)
                            }
                        }

                        MouseArea {
                            anchors.fill: parent
                            onClicked: {
                                if (view.hasEvent(vlist.nodeData, "action"))
                                    view.emitNodeEvent(vlist.nodeData, "action", {
                                        key: vlist.keyOf(row.rowIndex),
                                        action: modelData.id
                                    });
                            }
                        }
                    }
                }
            }

            Rectangle {
                id: rowContent

                width: parent.width
                height: parent.height
                color: vlist.isSelected(row.rowIndex)
                        ? view.withAlpha(view.themePrimary, 0.18)
                        : rowHover.hovered ? view.hoverColor(view.themeBackground)
                        : view.themeBackground

                Column {
                    id: rowColumn

                    width: parent.width
                    spacing: 0

                    Label {
                        width: parent.width
                        visible: vlist.stickySections && row.rowData !== undefined && row.rowData.section !== undefined
                                && (row.rowIndex === 0 || vlist.items[row.rowIndex - 1].section !== row.rowData.section)
                        text: visible && row.rowData !== undefined ? (row.rowData.section || "") : ""
                        leftPadding: 16
                        topPadding: 6
                        bottomPadding: 4
                        color: view.themeTextSecondary
                        font.pixelSize: view.fs(12)
                        font.bold: true
                        elide: Text.ElideRight
                    }

                    RowLayout {
                        width: parent.width
                        height: 56
                        spacing: 8

                        Label {
                            Layout.leftMargin: 16
                            visible: row.rowData !== undefined && row.rowData.icon !== undefined && row.rowData.icon.length > 0
                            text: visible ? row.rowData.icon : ""
                            font.family: view.iconFamily
                            font.pixelSize: view.fs(22)
                            color: view.themeTextSecondary
                        }

                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 0

                            Label {
                                Layout.fillWidth: true
                                text: row.rowData !== undefined ? row.rowData.title : ""
                                color: view.themeText
                                font.pixelSize: view.fs(15)
                                elide: Text.ElideRight
                            }

                            Label {
                                Layout.fillWidth: true
                                visible: text.length > 0
                                text: row.rowData !== undefined && row.rowData.subtitle !== undefined ? row.rowData.subtitle : ""
                                color: view.themeTextSecondary
                                font.pixelSize: view.fs(12)
                                elide: Text.ElideRight
                            }
                        }

                        Label {
                            visible: vlist.selectable && vlist.isSelected(row.rowIndex)
                            text: "check"
                            font.family: view.iconFamily
                            font.pixelSize: view.fs(20)
                            color: view.themePrimary
                        }

                        Label {
                            Layout.rightMargin: 16
                            visible: row.rowData !== undefined && row.rowData.trailing !== undefined && row.rowData.trailing.length > 0
                            text: visible ? row.rowData.trailing : ""
                            color: view.themeTextSecondary
                            font.pixelSize: view.fs(13)
                        }

                        Label {
                            Layout.rightMargin: 12
                            visible: vlist.reorderable
                            text: "drag_handle"
                            font.family: view.iconFamily
                            font.pixelSize: view.fs(20)
                            color: view.themeTextSecondary

                            DragHandler {
                                id: reorderDrag

                                target: null
                                enabled: vlist.interactive && vlist.reorderable

                                onActiveChanged: {
                                    if (active)
                                        return;

                                    const step = row.height + vlist.spacing;
                                    const delta = Math.round(reorderDrag.activeTranslation.y / Math.max(1, step));
                                    const to = Math.max(0, Math.min(vlist.count - 1, row.rowIndex + delta));

                                    if (to !== row.rowIndex && view.hasEvent(vlist.nodeData, "reorder"))
                                        view.emitNodeEvent(vlist.nodeData, "reorder", {
                                            from: row.rowIndex,
                                            to: to
                                        });
                                }
                            }
                        }
                    }
                }

                HoverHandler {
                    id: rowHover

                    cursorShape: Qt.PointingHandCursor
                }

                TapHandler {
                    onTapped: {
                        if (vlist.selectable) {
                            if (view.hasEvent(vlist.nodeData, "select"))
                                view.emitNodeEvent(vlist.nodeData, "select", {
                                    key: vlist.keyOf(row.rowIndex),
                                    selected: !vlist.isSelected(row.rowIndex)
                                });
                            return;
                        }

                        if (view.hasEvent(vlist.nodeData, "press"))
                            view.emitNodeEvent(vlist.nodeData, "press", vlist.keyOf(row.rowIndex));
                    }
                }

                DragHandler {
                    id: swipeDrag

                    target: null
                    enabled: vlist.interactive && vlist.swipeActions.length > 0

                    property real startX: 0

                    xAxis {
                        enabled: vlist.interactive && vlist.swipeActions.length > 0
                        minimum: -vlist.actionWidth
                        maximum: 0
                    }

                    yAxis {
                        enabled: false
                    }

                    onActiveChanged: {
                        if (active) {
                            startX = rowContent.x;
                            return;
                        }

                        rowContent.x = rowContent.x < -vlist.actionWidth / 2 ? -vlist.actionWidth : 0;
                    }

                    onActiveTranslationChanged: {
                        if (!active)
                            return;

                        rowContent.x = Math.max(-vlist.actionWidth, Math.min(0, startX + activeTranslation.x));
                    }
                }

                Behavior on color {
                    ColorAnimation {
                        duration: 120
                    }
                }
            }
        }
    }

    Rectangle {
        id: stickyHeader

        anchors.top: parent.top
        width: parent.width
        height: 28
        visible: vlist.stickySections && vlist.currentSection.length > 0
        color: view.themeSurface

        Label {
            id: stickyLabel

            anchors.fill: parent
            anchors.leftMargin: 16
            verticalAlignment: Text.AlignVCenter
            text: vlist.currentSection
            color: view.themeTextSecondary
            font.pixelSize: view.fs(12)
            font.bold: true
            elide: Text.ElideRight
        }
    }
}
