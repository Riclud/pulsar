import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ApplicationWindow {
    id: view

    visible: true
    color: themeBackground
    property var tree: []
    property string errorText: ""
    property bool testClicked: false


    readonly property bool darkMode: PulsarBridge.colorScheme === "dark"
    readonly property color themeBackground: darkMode ? "#121214" : "#f7f7f8"
    readonly property color themeSurface: darkMode ? "#1c1c20" : "#ffffff"
    readonly property color themeSurfaceVariant: darkMode ? "#2a2a30" : "#ececf0"
    readonly property color themePrimary: darkMode ? "#d0bcff" : "#6750a4"
    readonly property color themeText: darkMode ? "#e6e1e5" : "#1b1b1f"
    readonly property color themeTextSecondary: darkMode ? "#a9a9b0" : "#5f5f66"
    readonly property color themeBorder: darkMode ? "#3a3a41" : "#d9d9de"
    readonly property int themeRadius: 12
    readonly property int themeSpacing: 8

    FontLoader {
        id: iconFont
        source: "qrc:/runtime/fonts/MaterialIcons.ttf"
    }

    Item {
        id: host
        anchors.fill: parent
        property var pulsarMeta: null
    }

    Item {
        id: overlay
        anchors.fill: parent
        z: 1000
    }

    Rectangle {
        id: errorView

        anchors.fill: parent
        z: 2000
        visible: view.errorText.length > 0
        color: view.themeBackground

        Column {
            anchors.fill: parent
            anchors.margins: 24
            spacing: 16

            Label {
                text: "App error"
                font.pixelSize: 20
                font.bold: true
                color: view.themeText
            }

            ScrollView {
                width: parent.width
                height: parent.height - 120
                clip: true

                Label {
                    width: errorView.width - 48
                    text: view.errorText
                    wrapMode: Text.WrapAnywhere
                    font.family: "monospace"
                    color: view.themeTextSecondary
                }
            }

            Button {
                text: "Reload"
                visible: PulsarBridge.devMode()
                onClicked: PulsarBridge.devReload()
            }
        }
    }

    Component {
        id: appBarComponent

        Rectangle {
            id: bar

            implicitHeight: 56
            property var pulsarMeta: null
            property var nodeData: null
            property alias actionsRow: actions
            property alias titleLabel: titleText
            property alias subtitleLabel: subtitleText
            property alias backButton: back

            color: view.themeSurface

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 8
                anchors.rightMargin: 8
                spacing: 4

                ToolButton {
                    id: back

                    text: "arrow_back"
                    visible: false
                    font.family: iconFont.name
                    font.pixelSize: 24

                    onClicked: view.emitNodeEvent(bar.nodeData, "back")
                }

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 0

                    Label {
                        id: titleText

                        Layout.fillWidth: true
                        elide: Text.ElideRight
                        color: view.themeText
                        font.pixelSize: 18
                        font.bold: true
                    }

                    Label {
                        id: subtitleText

                        Layout.fillWidth: true
                        visible: text.length > 0
                        elide: Text.ElideRight
                        color: view.themeTextSecondary
                        font.pixelSize: 12
                    }
                }

                RowLayout {
                    id: actions
                    property var pulsarMeta: null
                    spacing: 0
                }
            }
        }
    }

    Component {
        id: chipComponent

        Rectangle {
            id: chipRoot

            implicitHeight: 32
            property var pulsarMeta: null
            property var nodeData: null
            property alias labelItem: chipLabel
            property alias removeButton: chipRemove
            property alias contentRow: chipRow

            radius: 16
            color: view.themeSurfaceVariant

            MouseArea {
                anchors.fill: parent
                onClicked: view.emitNodeEvent(chipRoot.nodeData, "click")
            }

            RowLayout {
                id: chipRow

                anchors.fill: parent
                anchors.leftMargin: 12
                anchors.rightMargin: 4
                spacing: 2

                Label {
                    id: chipLabel

                    color: view.themeText
                    font.pixelSize: 13
                }

                ToolButton {
                    id: chipRemove

                    text: "close"
                    visible: false
                    font.family: iconFont.name
                    font.pixelSize: 16

                    onClicked: view.emitNodeEvent(chipRoot.nodeData, "remove")
                }
            }
        }
    }

    Component {
        id: sheetComponent

        Item {
            id: sheetRoot

            anchors.fill: parent
            visible: open || opacity > 0
            opacity: open ? 1 : 0
            property bool open: false
            property bool dismissible: true
            property int fadeDuration: 140
            property real openedAT: 0
            property var pulsarMeta: null
            property var nodeData: null
            property alias contentLayout: sheetContent
            property alias titleLabel: sheetTitle
            property alias panel: sheetPanel
            property alias closeButton: sheetClose

            onOpenChanged: {
                if (open)
                    openedAT = Date.now();
            }

            Behavior on opacity {
                NumberAnimation {
                    duration: sheetRoot.fadeDuration
                    easing.type: Easing.OutCubic
                }
            }

            Rectangle {
                anchors.fill: parent
                color: "#99000000"
            }

            MouseArea {
                anchors.fill: parent
                onClicked: {
                    if (!sheetRoot.dismissible)
                        return;
                    if (Date.now() - sheetRoot.openedAT < 250)
                        return;
                    view.emitNodeEvent(sheetRoot.nodeData, "close");
                }
            }

            Rectangle {
                id: sheetPanel

                width: Math.min(parent.width - 24, 560)
                height: Math.min(parent.height - 48, 720)
                radius: view.themeRadius
                color: view.themeSurface

                MouseArea {
                    anchors.fill: parent
                }

                ColumnLayout {
                    anchors.fill: parent
                    spacing: 0

                    RowLayout {
                        Layout.fillWidth: true
                        Layout.leftMargin: 16
                        Layout.rightMargin: 4
                        Layout.topMargin: 4
                        Layout.bottomMargin: 4
                        spacing: 4

                        Label {
                            id: sheetTitle

                            Layout.fillWidth: true
                            elide: Text.ElideRight
                            color: view.themeText
                            font.pixelSize: 18
                            font.bold: true
                        }

                        ToolButton {
                            id: sheetClose

                            text: "close"
                            font.family: iconFont.name
                            font.pixelSize: 24

                            onClicked: view.emitNodeEvent(sheetRoot.nodeData, "close")
                        }
                    }

                    Rectangle {
                        Layout.fillWidth: true
                        implicitHeight: 1
                        color: view.themeBorder
                    }

                    Flickable {
                        id: sheetScroll

                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        clip: true
                        contentWidth: width
                        contentHeight: sheetContent.implicitHeight + 32

                        ColumnLayout {
                            id: sheetContent

                            property var pulsarMeta: null
                            x: 16
                            y: 16
                            width: sheetScroll.width - 32
                            spacing: view.themeSpacing
                        }
                    }
                }
            }
        }
    }

    Component {
        id: pagerComponent

        SwipeView {
            id: pagerRoot

            interactive: true
            property var pulsarMeta: null
            property var nodeData: null
            property bool syncing: false

            onCurrentIndexChanged: {
                if (pagerRoot.syncing)
                    return;
                view.emitNodeEvent(pagerRoot.nodeData, "change", currentIndex);
            }
        }
    }

    Component {
        id: tabsComponent

        ColumnLayout {
            id: tabsRoot

            spacing: 0
            property var pulsarMeta: null
            property var nodeData: null
            property var tabItems: []
            property bool syncing: false
            property alias contentLayout: tabsStack
            property alias tabBar: tabsBar

            TabBar {
                id: tabsBar

                Layout.fillWidth: true

                Repeater {
                    model: tabsRoot.tabItems

                    TabButton {
                        text: modelData.label
                    }
                }

                onCurrentIndexChanged: {
                    if (tabsRoot.syncing)
                        return;
                    view.emitNodeEvent(tabsRoot.nodeData, "change", currentIndex);
                }
            }

            StackLayout {
                id: tabsStack

                Layout.fillWidth: true
                Layout.fillHeight: true
                currentIndex: tabsBar.currentIndex
                property var pulsarMeta: null
            }
        }
    }

    Component {
        id: segmentedComponent

        TabBar {
            id: segmentedRoot

            property var pulsarMeta: null
            property var nodeData: null
            property var tabItems: []
            property bool syncing: false

            Repeater {
                model: segmentedRoot.tabItems

                TabButton {
                    text: modelData.label
                }
            }

            onCurrentIndexChanged: {
                if (segmentedRoot.syncing)
                    return;
                view.emitNodeEvent(segmentedRoot.nodeData, "change", currentIndex);
            }
        }
    }

    Component {
        id: snackbarComponent

        Item {
            id: snackRoot

            anchors.fill: parent
            visible: opacity > 0
            opacity: open ? 1 : 0
            z: 500
            property bool open: false
            property int stayDuration: 3000
            property real openedAT: 0
            property var pulsarMeta: null
            property var nodeData: null
            property alias textLabel: snackText
            property alias actionButton: snackAction
            property alias contentRow: snackRow

            Behavior on opacity {
                NumberAnimation {
                    duration: 120
                    easing.type: Easing.OutCubic
                }
            }

            onOpenChanged: {
                if (!open)
                    return;
                openedAT = Date.now();
                hideTimer.restart();
            }

            Timer {
                id: hideTimer

                onTriggered: {
                    if (snackRoot.open)
                        view.emitNodeEvent(snackRoot.nodeData, "close");
                }
            }

            Rectangle {
                anchors.horizontalCenter: parent.horizontalCenter
                anchors.bottom: parent.bottom
                anchors.bottomMargin: 24
                width: Math.min(parent.width - 32, 560)
                height: snackRow.implicitHeight + 24
                radius: view.themeRadius
                color: view.darkMode ? "#323238" : "#3b3b42"

                RowLayout {
                    id: snackRow

                    anchors.fill: parent
                    anchors.margins: 12
                    spacing: 8

                    Label {
                        id: snackText

                        Layout.fillWidth: true
                        color: "#ffffff"
                        wrapMode: Text.WordWrap
                    }

                    Button {
                        id: snackAction

                        visible: false
                        flat: true

                        onClicked: view.emitNodeEvent(snackRoot.nodeData, "action")
                    }
                }
            }
        }
    }

    Component {
        id: popoverComponent

        Item {
            id: popRoot

            anchors.fill: parent
            visible: open || opacity > 0
            opacity: open ? 1 : 0
            z: 600
            property bool open: false
            property bool modal: false
            property bool dismissible: true
            property int fadeDuration: 120
            property real openedAT: 0
            property var pulsarMeta: null
            property var nodeData: null
            property alias panel: popPanel
            property alias contentLayout: popContent

            Behavior on opacity {
                NumberAnimation {
                    duration: popRoot.fadeDuration
                    easing.type: Easing.OutCubic
                }
            }

            onOpenChanged: {
                if (open)
                    openedAT = Date.now();
            }

            Rectangle {
                anchors.fill: parent
                color: popRoot.modal ? "#66000000" : "transparent"

                MouseArea {
                    anchors.fill: parent
                    onClicked: {
                        if (!popRoot.dismissible)
                            return;
                        if (Date.now() - popRoot.openedAT < 250)
                            return;
                        view.emitNodeEvent(popRoot.nodeData, "close");
                    }
                }
            }

            Rectangle {
                id: popPanel

                width: Math.min(parent.width - 32, 320)
                radius: view.themeRadius
                color: view.themeSurface
                border.width: 1
                border.color: view.themeBorder
                x: 16
                y: 16

                ColumnLayout {
                    id: popContent

                    x: 12
                    y: 12
                    width: popPanel.width - 24
                    spacing: 4
                    property var pulsarMeta: null
                }
            }
        }
    }

    Component {
        id: zoomableComponent

        Item {
            id: zoomRoot

            clip: true
            property var pulsarMeta: null
            property var nodeData: null
            property real zoom: 1
            property real minZoom: 1
            property real maxZoom: 4
            property alias contentItem: zoomContent

            Item {
                id: zoomContent

                anchors.fill: parent
                transformOrigin: Item.Center
                property var pulsarMeta: null
                scale: Math.max(zoomRoot.minZoom, Math.min(zoomRoot.maxZoom, zoomRoot.zoom * pinch.persistentScale * pinch.activeScale))

                PinchHandler {
                    id: pinch

                    target: null
                    minimumScale: 0.25
                    maximumScale: 16

                    onActiveChanged: {
                        if (active)
                            return;

                        const next = Math.max(zoomRoot.minZoom, Math.min(zoomRoot.maxZoom, zoomRoot.zoom * pinch.persistentScale));

                        pinch.persistentScale = 1;

                        if (next === zoomRoot.zoom)
                            return;

                        zoomRoot.zoom = next;
                        view.emitNodeEvent(zoomRoot.nodeData, "zoom", next);
                    }
                }
            }
        }
    }

    Component {
        id: gridComponent

        Flickable {
            id: gridFlick

            clip: true
            boundsBehavior: Flickable.StopAtBounds
            property var pulsarMeta: null
            property alias gridLayout: gridLayout

            contentWidth: width
            contentHeight: gridLayout.implicitHeight + 2 * gridLayout.padding

            GridLayout {
                id: gridLayout

                property var pulsarMeta: null
                property int padding: 0

                x: padding
                y: padding
                width: gridFlick.width - 2 * padding
                columns: 2
                columnSpacing: 8
                rowSpacing: 8
            }
        }
    }

    Component {
        id: virtualListComponent

        Item {
            id: vlistRoot

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
                topMargin: padding
                bottomMargin: padding

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
                    if (endReached || !hasEvent(nodeData, "endReached"))
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

                        if (hasEvent(nodeData, "refresh"))
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
                                color: modelData.color !== undefined ? modelData.color : "#b3261e"

                                Column {
                                    anchors.centerIn: parent
                                    spacing: 2

                                    Label {
                                        anchors.horizontalCenter: parent.horizontalCenter
                                        text: modelData.icon !== undefined ? modelData.icon : ""
                                        visible: text.length > 0
                                        font.family: iconFont.name
                                        font.pixelSize: 20
                                        color: "#ffffff"
                                    }

                                    Label {
                                        anchors.horizontalCenter: parent.horizontalCenter
                                        text: modelData.label !== undefined ? modelData.label : modelData.id
                                        color: "#ffffff"
                                        font.pixelSize: 11
                                    }
                                }

                                MouseArea {
                                    anchors.fill: parent
                                    onClicked: {
                                        if (hasEvent(vlist.nodeData, "action"))
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
                        color: vlist.isSelected(row.rowIndex) ? (view.darkMode ? "#2d2d38" : "#e8e0ff")
                                : "transparent"

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
                                font.pixelSize: 12
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
                                    font.family: iconFont.name
                                    font.pixelSize: 22
                                    color: view.themeTextSecondary
                                }

                                ColumnLayout {
                                    Layout.fillWidth: true
                                    spacing: 0

                                    Label {
                                        Layout.fillWidth: true
                                        text: row.rowData !== undefined ? row.rowData.title : ""
                                        color: view.themeText
                                        font.pixelSize: 15
                                        elide: Text.ElideRight
                                    }

                                    Label {
                                        Layout.fillWidth: true
                                        visible: text.length > 0
                                        text: row.rowData !== undefined && row.rowData.subtitle !== undefined ? row.rowData.subtitle : ""
                                        color: view.themeTextSecondary
                                        font.pixelSize: 12
                                        elide: Text.ElideRight
                                    }
                                }

                                Label {
                                    visible: vlist.selectable && vlist.isSelected(row.rowIndex)
                                    text: "check"
                                    font.family: iconFont.name
                                    font.pixelSize: 20
                                    color: view.themePrimary
                                }

                                Label {
                                    Layout.rightMargin: 16
                                    visible: row.rowData !== undefined && row.rowData.trailing !== undefined && row.rowData.trailing.length > 0
                                    text: visible ? row.rowData.trailing : ""
                                    color: view.themeTextSecondary
                                    font.pixelSize: 13
                                }

                                Label {
                                    Layout.rightMargin: 12
                                    visible: vlist.reorderable
                                    text: "drag_handle"
                                    font.family: iconFont.name
                                    font.pixelSize: 20
                                    color: view.themeTextSecondary

                                    DragHandler {
                                        id: reorderDrag

                                        target: null

                                        onActiveChanged: {
                                            if (active)
                                                return;

                                            const step = row.height + vlist.spacing;
                                            const delta = Math.round(reorderDrag.activeTranslation.y / Math.max(1, step));
                                            const to = Math.max(0, Math.min(vlist.count - 1, row.rowIndex + delta));

                                            if (to !== row.rowIndex && hasEvent(vlist.nodeData, "reorder"))
                                                view.emitNodeEvent(vlist.nodeData, "reorder", {
                                                    from: row.rowIndex,
                                                    to: to
                                                });
                                        }
                                    }
                                }
                            }
                        }

                        MouseArea {
                            anchors.fill: parent
                            onClicked: {
                                if (vlist.selectable) {
                                    if (hasEvent(vlist.nodeData, "select"))
                                        view.emitNodeEvent(vlist.nodeData, "select", {
                                            key: vlist.keyOf(row.rowIndex),
                                            selected: !vlist.isSelected(row.rowIndex)
                                        });
                                    return;
                                }

                                if (hasEvent(vlist.nodeData, "press"))
                                    view.emitNodeEvent(vlist.nodeData, "press", vlist.keyOf(row.rowIndex));
                            }
                        }

                        DragHandler {
                            id: swipeDrag

                            target: null

                            property real startX: 0

                            xAxis {
                                enabled: vlist.swipeActions.length > 0
                                minimum: -vlist.actionWidth
                                maximum: 0
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
                    font.pixelSize: 12
                    font.bold: true
                    elide: Text.ElideRight
                }
            }
        }
    }

    onTreeChanged: {
        errorText = ""
        rebuild()
    }

    Timer {
        id: testClick

        onTriggered: {
            const clicked = clickFirst(host) || clickFirst(overlay);
            if (clicked)
                view.testClicked = true;
            if (PulsarBridge.env("PULSAR_DEBUG"))
                console.log("PulsarView test click " + clicked);
        }
    }

    function clickFirst(item) {
        const kids = item.children;
        for (let i = 0; i < kids.length; i++) {
            const child = kids[i];
            if (!child.visible || child.enabled === false)
                continue;
            if (child.clicked !== undefined) {
                child.clicked();
                return true;
            }
            if (clickFirst(child))
                return true;
        }
        return false;
    }

    function maybeTestClick() {
        if (view.testClicked)
            return;
        const ms = parseInt(PulsarBridge.env("PULSAR_UI_AUTOCLICK_MS") || "0");
        if (ms <= 0)
            return;
        testClick.interval = ms;
        testClick.restart();
    }

    function prop(obj, key, fallback) {
        return obj[key] !== undefined ? obj[key] : fallback;
    }

    function hasEvent(node, event) {
        return node !== null && node !== undefined && node.events !== undefined && node.events.indexOf(event) >= 0;
    }

    function emitEvent(node, event, value) {
        if (!node)
            return;
        PulsarBridge.emit("ui-event", {
            id: node.id,
            event: event,
            value: value
        });
    }

    function emitNodeEvent(node, event, value) {
        if (!hasEvent(node, event))
            return;
        emitEvent(node, event, value);
    }

    function make(code, parent) {
        return Qt.createQmlObject(code, parent, "pulsar-ui");
    }

    function contentMeta() {
        return {
            type: "content",
            node: null,
            index: ({}),
            order: [],
            content: null,
            extra: ({})
        };
    }

    function makeContent(parent) {
        const inner = make("import QtQuick.Layouts; ColumnLayout { property var pulsarMeta: null }", parent);

        inner.pulsarMeta = contentMeta();

        return inner;
    }

    function makeWrapper(parent) {
        const wrapper = make("import QtQuick; Item { property var pulsarMeta: null }", parent);

        wrapper.pulsarMeta = contentMeta();

        return wrapper;
    }

    function clearContainer(parent) {
        const meta = parent.pulsarMeta;

        if (!meta)
            return;

        for (const key in meta.index) {
            if (meta.index[key])
                meta.index[key].destroy();
        }

        meta.index = ({});
        meta.order = [];
    }

    function reconcile(parent, nodes, isRoot) {
        const meta = parent.pulsarMeta;

        if (!meta)
            return;

        let index = meta.index;
        let oldOrder = meta.order;
        const paths = [];
        let compatible = true;
        let seenNew = false;
        let lastOld = -1;

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const item = index[node.path];
            paths.push(node.path);

            if (item && item.pulsarMeta.type !== node.type) {
                compatible = false;
                break;
            }

            const oldIndex = oldOrder.indexOf(node.path);
            const existed = oldIndex >= 0;

            if (!existed)
                seenNew = true;
            else if (seenNew) {
                compatible = false;
                break;
            }

            if (existed) {
                if (oldIndex < lastOld) {
                    compatible = false;
                    break;
                }

                lastOld = oldIndex;
            }
        }

        if (!compatible) {
            clearContainer(parent);
            index = meta.index;
            oldOrder = meta.order;
        }

        for (const key in index) {
            if (paths.indexOf(key) < 0) {
                if (index[key])
                    index[key].destroy();
                delete index[key];
            }
        }

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            let item = index[node.path];

            if (item) {
                updateNode(item, node, isRoot);
                continue;
            }

            item = createNode(node, parent, isRoot);
            index[node.path] = item;
        }

        meta.order = paths;
    }

    function createNode(node, parent, isRoot) {
        let item = null;
        const base = "{ property var pulsarMeta: null }";

        if (node.type === "column" || node.type === "row") {
            item = make("import QtQuick.Layouts; " + (node.type === "column" ? "ColumnLayout" : "RowLayout") + " " + base, parent);
        } else if (node.type === "box") {
            item = make("import QtQuick; Rectangle " + base, parent);
        } else if (node.type === "scroll" || node.type === "list") {
            item = make("import QtQuick; Flickable " + "{ clip: true; boundsBehavior: Flickable.StopAtBounds; property var pulsarMeta: null }", parent);
        } else if (node.type === "grid") {
            item = gridComponent.createObject(parent);
        } else if (node.type === "virtualList") {
            item = virtualListComponent.createObject(parent);
        } else if (node.type === "card") {
            item = make("import QtQuick; Rectangle { border.width: 1; property var pulsarMeta: null }", parent);
        } else if (node.type === "appBar") {
            item = appBarComponent.createObject(parent);
        } else if (node.type === "chip") {
            item = chipComponent.createObject(parent);
        } else if (node.type === "sheet") {
            item = sheetComponent.createObject(overlay);
        } else if (node.type === "pager") {
            item = pagerComponent.createObject(parent);
        } else if (node.type === "tabs") {
            item = tabsComponent.createObject(parent);
        } else if (node.type === "segmented") {
            item = segmentedComponent.createObject(parent);
        } else if (node.type === "snackbar") {
            item = snackbarComponent.createObject(overlay);
        } else if (node.type === "popover") {
            item = popoverComponent.createObject(overlay);
        } else if (node.type === "zoomable") {
            item = zoomableComponent.createObject(parent);
        } else if (node.type === "text") {
            item = make("import QtQuick.Controls; Label " + base, parent);
        } else if (node.type === "selectableText") {
            item = make("import QtQuick; TextEdit { readOnly: true; selectByMouse: true; property var pulsarMeta: null }", parent);
        } else if (node.type === "button") {
            item = make("import QtQuick.Controls; Button " + base, parent);
        } else if (node.type === "icon") {
            item = make("import QtQuick; Text " + base, parent);
        } else if (node.type === "iconButton") {
            item = make("import QtQuick.Controls; ToolButton " + base, parent);
        } else if (node.type === "textInput") {
            item = make("import QtQuick.Controls; TextField " + base, parent);
        } else if (node.type === "textArea") {
            item = make("import QtQuick.Controls; TextArea " + base, parent);
        } else if (node.type === "checkbox" || node.type === "switch") {
            item = make("import QtQuick.Controls; " + (node.type === "checkbox" ? "CheckBox" : "Switch") + " " + base, parent);
        } else if (node.type === "slider") {
            item = make("import QtQuick.Controls; Slider " + base, parent);
        } else if (node.type === "select") {
            item = make("import QtQuick.Controls; ComboBox " + base, parent);
        } else if (node.type === "progress") {
            item = make("import QtQuick.Controls; ProgressBar " + base, parent);
        } else if (node.type === "image") {
            item = make("import QtQuick; Image " + base, parent);
        } else if (node.type === "spacer") {
            item = make("import QtQuick; Item " + base, parent);
        } else if (node.type === "divider") {
            item = make("import QtQuick; Rectangle " + base, parent);
        } else {
            item = make("import QtQuick; Rectangle " + base, parent);
        }

        item.pulsarMeta = {
            type: node.type,
            node: node,
            index: ({}),
            order: [],
            content: null,
            extra: ({})
        };
        prepareItem(item, node);
        updateNode(item, node, isRoot);

        return item;
    }

    function prepareItem(item, node) {
        if (node.type === "button") {
            item.clicked.connect(function () {
                if (hasEvent(item.pulsarMeta.node, "click"))
                    emitEvent(item.pulsarMeta.node, "click");
            });
        } else if (node.type === "iconButton") {
            item.clicked.connect(function () {
                if (hasEvent(item.pulsarMeta.node, "click"))
                    emitEvent(item.pulsarMeta.node, "click");
            });
        } else if (node.type === "textInput" || node.type === "textArea") {
            item.textChanged.connect(function () {
                if (item.pulsarMeta.syncing === true)
                    return;
                if (hasEvent(item.pulsarMeta.node, "input"))
                    emitEvent(item.pulsarMeta.node, "input", item.text);
            });
            item.activeFocusChanged.connect(function () {
                emitEvent(item.pulsarMeta.node, item.activeFocus ? "focus" : "blur");
            });
            if (node.type === "textInput") {
                item.accepted.connect(function () {
                    if (hasEvent(item.pulsarMeta.node, "submit"))
                        emitEvent(item.pulsarMeta.node, "submit", item.text);
                });
            }
            if (Qt.platform.os === "android") {
                const tap = make("import QtQuick; TapHandler {}", item);
                tap.tapped.connect(function () {
                    item.forceActiveFocus();
                    Qt.inputMethod.show();
                });
            }
        } else if (node.type === "checkbox" || node.type === "switch") {
            item.toggled.connect(function (value) {
                if (item.pulsarMeta.syncing === true)
                    return;
                if (hasEvent(item.pulsarMeta.node, "toggle"))
                    emitEvent(item.pulsarMeta.node, "toggle", value);
            });

            const area = make("import QtQuick; MouseArea { anchors.fill: parent; z: 10 }", item);

            area.clicked.connect(function () {
                if (item.pulsarMeta.syncing === true)
                    return;

                item.pulsarMeta.syncing = true;
                item.checked = !item.checked;
                item.pulsarMeta.syncing = false;

                if (hasEvent(item.pulsarMeta.node, "toggle"))
                    emitEvent(item.pulsarMeta.node, "toggle", item.checked);
            });
        } else if (node.type === "slider") {
            item.moved.connect(function () {
                if (item.pulsarMeta.syncing === true)
                    return;
                if (hasEvent(item.pulsarMeta.node, "change"))
                    emitEvent(item.pulsarMeta.node, "change", item.value);
            });
        } else if (node.type === "select") {
            item.activated.connect(function (index) {
                const options = item.pulsarMeta.node ? item.pulsarMeta.node.props.options : [];

                if (index >= 0 && index < options.length)
                    emitEvent(item.pulsarMeta.node, "change", options[index].value);
            });
        }

        if (hasEvent(node, "longPress")) {
            const press = make("import QtQuick; TapHandler { longPressThreshold: 0.5 }", item);

            press.longPressed.connect(function () {
                if (hasEvent(item.pulsarMeta.node, "longPress"))
                    emitEvent(item.pulsarMeta.node, "longPress");
            });
        }
    }

    function applyTooltip(item, text) {
        let tip = item.pulsarMeta.extra.tooltip;

        if (!tip) {
            tip = make("import QtQuick.Controls; ToolTip { delay: 400 }", item);

            item.pulsarMeta.extra.tooltip = tip;

            const hover = make("import QtQuick; HoverHandler {}", item);

            hover.hoveredChanged.connect(function () {
                const current = item.pulsarMeta.node ? prop(item.pulsarMeta.node.props, "tooltip", "") : "";

                if (hover.hovered && current.length > 0) {
                    tip.text = current;
                    tip.open();
                } else {
                    tip.close();
                }
            });
        }

        tip.text = text;
    }

    function applyCommon(item, node, isRoot) {
        const props = node.props;
        const defaultFillWidth = node.type === "card" || node.type === "list" || node.type === "scroll"
                || node.type === "grid" || node.type === "virtualList"
                || node.type === "appBar" || node.type === "divider" || node.type === "textInput"
                || node.type === "textArea" || node.type === "pager" || node.type === "tabs"
                || node.type === "segmented";
        const fill = prop(props, "fill", undefined);
        let fillWidth = defaultFillWidth;
        let fillHeight = node.type === "list" || node.type === "scroll" || node.type === "grid"
                || node.type === "virtualList" || node.type === "pager" || node.type === "tabs";

        if (props.expand !== undefined)
            fillWidth = props.expand;
        if (fill !== undefined) {
            fillWidth = fill;
            fillHeight = fill;
        }
        if (props.fillWidth !== undefined)
            fillWidth = props.fillWidth;
        if (props.fillHeight !== undefined)
            fillHeight = props.fillHeight;

        if (node.type === "sheet" || node.type === "snackbar" || node.type === "popover")
            return;

        const tooltip = prop(props, "tooltip", "");

        if (tooltip.length > 0)
            applyTooltip(item, tooltip);

        if (props.width !== undefined) {
            item.width = props.width;
            item.Layout.preferredWidth = props.width;
        }

        if (props.height !== undefined) {
            item.height = props.height;
            item.Layout.preferredHeight = props.height;
        }

        if (props.visible !== undefined)
            item.visible = props.visible;
        if (props.opacity !== undefined)
            item.opacity = props.opacity;

        item.Layout.fillWidth = fillWidth;
        item.Layout.fillHeight = fillHeight;

        if (!isRoot)
            return;

        item.width = Qt.binding(function () {
            return host.width;
        });

        if (fillHeight)
            item.height = Qt.binding(function () {
                return host.height;
            });
    }

    function updateNode(item, node, isRoot) {
        item.pulsarMeta.node = node;

        applyCommon(item, node, isRoot);

        const props = node.props;

        if (node.type === "column" || node.type === "row") {
            item.spacing = prop(props, "gap", 0);
            reconcile(item, node.children || [], false);
        } else if (node.type === "box") {
            item.color = prop(props, "color", "transparent");
            item.radius = prop(props, "radius", 0);

            let inner = item.pulsarMeta.content;
            const padding = prop(props, "padding", 0);

            if (!inner) {
                inner = makeContent(item);
                inner.anchors.fill = item;
                item.pulsarMeta.content = inner;
            }

            inner.anchors.margins = padding;
            inner.spacing = 0;
            item.implicitWidth = Qt.binding(function () {
                return inner.implicitWidth + 2 * padding;
            });
            item.implicitHeight = Qt.binding(function () {
                return inner.implicitHeight + 2 * padding;
            });
            reconcile(inner, node.children || [], false);
        } else if (node.type === "scroll" || node.type === "list") {
            let wrapper = item.pulsarMeta.content;

            if (!wrapper) {
                wrapper = makeWrapper(item);
                wrapper.width = Qt.binding(function () {
                    return item.width;
                });
                wrapper.implicitWidth = Qt.binding(function () {
                    return item.width;
                });
                item.pulsarMeta.content = wrapper;
                item.contentWidth = Qt.binding(function () {
                    return item.width;
                });
                item.contentHeight = Qt.binding(function () {
                    return wrapper.implicitHeight;
                });

                const inner = makeContent(wrapper);

                wrapper.pulsarMeta.content = inner;
                wrapper.implicitHeight = Qt.binding(function () {
                    return inner.implicitHeight + 2 * prop(item.pulsarMeta.node.props, "padding", 0);
                });
                inner.x = Qt.binding(function () {
                    return prop(item.pulsarMeta.node.props, "padding", 0);
                });
                inner.y = Qt.binding(function () {
                    return prop(item.pulsarMeta.node.props, "padding", 0);
                });
                inner.width = Qt.binding(function () {
                    return Math.max(0, wrapper.width - 2 * prop(item.pulsarMeta.node.props, "padding", 0));
                });
            }

            const inner = wrapper.pulsarMeta.content;
            inner.spacing = node.type === "list" ? prop(props, "spacing", 0) : prop(props, "gap", view.themeSpacing);
            reconcile(inner, node.children || [], false);
        } else if (node.type === "grid") {
            const gap = prop(props, "gap", view.themeSpacing);
            const padding = prop(props, "padding", 0);

            item.gridLayout.columns = prop(props, "columns", 2);
            item.gridLayout.columnSpacing = gap;
            item.gridLayout.rowSpacing = gap;
            item.gridLayout.padding = padding;

            if (!item.gridLayout.pulsarMeta)
                item.gridLayout.pulsarMeta = contentMeta();

            reconcile(item.gridLayout, node.children || [], false);
        } else if (node.type === "virtualList") {
            const list = item.listView;
            const items = prop(props, "items", []);

            list.nodeData = node;
            list.items = items;
            list.selectedKeys = prop(props, "selected", []);
            list.selectable = prop(props, "selectable", false);
            list.reorderable = prop(props, "reorderable", false);
            list.refreshable = prop(props, "refreshable", false);
            list.stickySections = prop(props, "stickySections", false);
            list.swipeActions = prop(props, "swipeActions", []);
            list.spacing = prop(props, "spacing", 0);
            list.padding = prop(props, "padding", 0);

            const sections = [];
            let current = "";

            for (let i = 0; i < items.length; i++) {
                if (items[i].section !== undefined && items[i].section.length > 0)
                    current = items[i].section;

                sections.push(current);
            }

            list.sectionForIndex = sections;
            list.updateSticky();
        } else if (node.type === "card") {
            item.color = prop(props, "color", view.themeSurface);
            item.radius = prop(props, "radius", view.themeRadius);
            item.border.color = view.themeBorder;

            let inner = item.pulsarMeta.content;
            const padding = prop(props, "padding", 16);

            if (!inner) {
                inner = makeContent(item);
                inner.anchors.fill = item;
                item.pulsarMeta.content = inner;
                item.implicitWidth = Qt.binding(function () {
                    return inner.implicitWidth + 2 * prop(item.pulsarMeta.node.props, "padding", 16);
                });
                item.implicitHeight = Qt.binding(function () {
                    return inner.implicitHeight + 2 * prop(item.pulsarMeta.node.props, "padding", 16);
                });
            }

            inner.anchors.margins = padding;
            inner.spacing = view.themeSpacing;
            reconcile(inner, node.children || [], false);
        } else if (node.type === "appBar") {
            item.nodeData = node;
            item.titleLabel.text = prop(props, "title", "");
            item.subtitleLabel.text = prop(props, "subtitle", "");
            item.subtitleLabel.visible = item.subtitleLabel.text.length > 0;
            item.backButton.visible = hasEvent(node, "back");
            item.implicitHeight = prop(props, "height", 56);

            if (!item.actionsRow.pulsarMeta)
                item.actionsRow.pulsarMeta = contentMeta();

            reconcile(item.actionsRow, node.children || [], false);
        } else if (node.type === "chip") {
            item.nodeData = node;
            item.labelItem.text = prop(props, "label", "");
            item.color = prop(props, "color", view.themeSurfaceVariant);
            item.removeButton.visible = hasEvent(node, "remove");
            item.implicitWidth = Qt.binding(function () {
                return item.contentRow.implicitWidth;
            });
        } else if (node.type === "sheet") {
            item.nodeData = node;
            item.dismissible = prop(props, "dismissible", true);
            item.fadeDuration = prop(props, "duration", 140);
            item.open = prop(props, "open", true);
            item.titleLabel.text = prop(props, "title", "");
            item.closeButton.visible = hasEvent(node, "close");

            if (props.fullscreen) {
                item.panel.x = 0;
                item.panel.y = 0;
                item.panel.width = Qt.binding(function () {
                    return item.width;
                });
                item.panel.height = Qt.binding(function () {
                    return item.height;
                });
                item.panel.radius = 0;
            } else {
                item.panel.width = Qt.binding(function () {
                    return Math.min(item.width - 24, 560);
                });
                item.panel.height = Qt.binding(function () {
                    return Math.min(item.height - 48, 720);
                });
                item.panel.x = Qt.binding(function () {
                    return (item.width - item.panel.width) / 2;
                });
                item.panel.y = Qt.binding(function () {
                    return (item.height - item.panel.height) / 2;
                });
                item.panel.radius = view.themeRadius;
            }

            if (!item.contentLayout.pulsarMeta)
                item.contentLayout.pulsarMeta = contentMeta();

            reconcile(item.contentLayout, node.children || [], false);
        } else if (node.type === "pager") {
            item.nodeData = node;
            item.syncing = true;
            item.currentIndex = prop(props, "index", item.currentIndex);
            item.interactive = prop(props, "interactive", true);
            item.syncing = false;
            reconcile(item, node.children || [], false);
        } else if (node.type === "tabs") {
            item.nodeData = node;
            item.tabItems = prop(props, "items", []);
            const tabIndex = prop(props, "index", 0);

            item.syncing = true;
            item.tabBar.currentIndex = tabIndex;
            item.syncing = false;

            if (!item.contentLayout.pulsarMeta)
                item.contentLayout.pulsarMeta = contentMeta();

            reconcile(item.contentLayout, node.children || [], false);

            for (let i = 0; i < item.contentLayout.children.length; i++) {
                const page = item.contentLayout.children[i];

                if (page.Layout !== undefined) {
                    page.Layout.fillWidth = true;
                    page.Layout.fillHeight = true;
                }
            }
        } else if (node.type === "segmented") {
            item.nodeData = node;
            item.tabItems = prop(props, "items", []);
            item.syncing = true;
            item.currentIndex = prop(props, "value", 0);
            item.syncing = false;
        } else if (node.type === "snackbar") {
            item.nodeData = node;
            item.textLabel.text = prop(props, "text", "");
            item.actionButton.text = prop(props, "actionLabel", "");
            item.actionButton.visible = hasEvent(node, "action");
            item.stayDuration = prop(props, "duration", 3000);
            item.open = prop(props, "open", true);
        } else if (node.type === "popover") {
            item.nodeData = node;
            item.open = prop(props, "open", true);
            item.modal = prop(props, "modal", false);
            item.dismissible = prop(props, "dismissible", true);
            item.fadeDuration = prop(props, "duration", 120);

            const popWidth = prop(props, "width", Math.min(item.panel.parent.width - 32, 320));

            item.panel.width = popWidth;
            item.panel.x = prop(props, "x", (item.width - popWidth) / 2);
            item.panel.y = prop(props, "y", (item.height - item.panel.implicitHeight) / 2);
            item.panel.height = Qt.binding(function () {
                return item.contentLayout.implicitHeight + 24;
            });

            if (!item.contentLayout.pulsarMeta)
                item.contentLayout.pulsarMeta = contentMeta();

            reconcile(item.contentLayout, node.children || [], false);
        } else if (node.type === "zoomable") {
            item.nodeData = node;
            item.minZoom = prop(props, "minScale", 1);
            item.maxZoom = prop(props, "maxScale", 4);
            item.zoom = prop(props, "zoom", 1);

            if (!item.contentItem.pulsarMeta)
                item.contentItem.pulsarMeta = contentMeta();

            reconcile(item.contentItem, node.children || [], false);
        } else if (node.type === "text" || node.type === "selectableText") {
            const wrap = prop(props, "wrap", false);
            const align = prop(props, "align", "left");

            item.text = prop(props, "text", "");
            item.color = prop(props, "color", view.themeText);
            item.font.pixelSize = prop(props, "size", 15);
            item.font.bold = prop(props, "bold", false);
            item.textFormat = prop(props, "markdown", false) ? Text.MarkdownText : Text.PlainText;
            item.horizontalAlignment = align === "center" ? Text.AlignHCenter
                    : align === "right" ? Text.AlignRight : Text.AlignLeft;
            item.wrapMode = wrap ? Text.WordWrap : Text.NoWrap;

            if (node.type === "text") {
                const elide = prop(props, "elide", false);

                item.elide = elide === "left" ? Text.ElideLeft
                        : elide === "middle" ? Text.ElideMiddle
                        : (elide === "right" || elide === true) ? Text.ElideRight : Text.ElideNone;

                if (props.maxLines !== undefined)
                    item.maximumLineCount = props.maxLines;
            } else {
                item.selectByMouse = prop(props, "selectable", true);

                if (props.height === undefined && props.maxLines === undefined) {
                    item.height = Qt.binding(function () {
                        return item.contentHeight;
                    });
                }
            }

            item.Layout.preferredWidth = -1;
        } else if (node.type === "button") {
            item.text = prop(props, "label", "");
            item.enabled = prop(props, "enabled", true);
        } else if (node.type === "icon") {
            item.text = prop(props, "name", "");
            item.font.family = iconFont.name;
            item.font.pixelSize = prop(props, "size", 24);
            item.color = prop(props, "color", view.themeText);
        } else if (node.type === "iconButton") {
            item.text = prop(props, "name", "");
            item.enabled = prop(props, "enabled", true);
            item.font.family = iconFont.name;
            item.font.pixelSize = prop(props, "size", 24);
            item.implicitWidth = 40;
            item.implicitHeight = 40;
        } else if (node.type === "textInput" || node.type === "textArea") {
            const keyboard = prop(props, "keyboardType", "text");

            item.placeholderText = prop(props, "placeholder", "");
            item.readOnly = prop(props, "readOnly", false);

            if (props.maxLength !== undefined)
                item.maximumLength = props.maxLength;

            if (props.selectable !== undefined)
                item.selectByMouse = props.selectable;

            if (node.type === "textInput") {
                item.echoMode = prop(props, "password", false) ? TextInput.Password : TextInput.Normal;
                item.inputMethodHints = keyboard === "email" ? Qt.ImhEmailCharactersOnly
                        : keyboard === "number" ? Qt.ImhDigitsOnly
                        : keyboard === "decimal" ? Qt.ImhFormattedNumbersOnly
                        : keyboard === "phone" ? Qt.ImhDialableCharactersOnly
                        : keyboard === "url" ? Qt.ImhUrlCharactersOnly
                        : keyboard === "search" ? Qt.ImhNoPredictiveText
                        : Qt.ImhNone;
            } else {
                item.wrapMode = TextEdit.Wrap;

                if (props.lines !== undefined && props.height === undefined)
                    item.Layout.preferredHeight = props.lines * 24;
            }

            if (!item.activeFocus) {
                item.pulsarMeta.syncing = true;
                item.text = prop(props, "value", "");
                item.pulsarMeta.syncing = false;
            }

            if (prop(props, "autoFocus", false) && item.pulsarMeta.extra.autoFocused !== true) {
                item.pulsarMeta.extra.autoFocused = true;
                Qt.callLater(function () {
                    item.forceActiveFocus();
                });
            }
        } else if (node.type === "checkbox" || node.type === "switch") {
            item.text = prop(props, "label", "");
            item.pulsarMeta.syncing = true;
            item.checked = prop(props, "checked", false);
            item.pulsarMeta.syncing = false;
        } else if (node.type === "slider") {
            item.pulsarMeta.syncing = true;
            item.value = prop(props, "value", 0);
            item.from = prop(props, "min", 0);
            item.to = prop(props, "max", 100);
            item.pulsarMeta.syncing = false;
        } else if (node.type === "select") {
            const options = prop(props, "options", []);
            const labels = [];

            for (let i = 0; i < options.length; i++)
                labels.push(options[i].label);

            const key = JSON.stringify(labels);

            if (item.pulsarMeta.extra.optionsKey !== key) {
                item.model = labels;
                item.pulsarMeta.extra.optionsKey = key;
            }

            let current = 0;

            for (let i = 0; i < options.length; i++) {
                if (options[i].value === prop(props, "value", undefined)) {
                    current = i;
                    break;
                }
            }

            item.currentIndex = current;
            item.Layout.preferredWidth = prop(props, "expand", false) ? -1 : prop(props, "width", 200);
        } else if (node.type === "progress") {
            item.indeterminate = prop(props, "indeterminate", false);
            item.value = Math.max(0, Math.min(1, prop(props, "value", 0)));
            item.Layout.preferredWidth = prop(props, "expand", false) ? -1 : prop(props, "width", 160);
        } else if (node.type === "image") {
            item.source = prop(props, "src", "");

            if (props.fillMode !== undefined)
                item.fillMode = props.fillMode;
        } else if (node.type === "spacer") {
            const size = prop(props, "size", 0);
            item.Layout.preferredWidth = prop(props, "width", size);
            item.Layout.preferredHeight = prop(props, "height", size);
        } else if (node.type === "divider") {
            item.color = prop(props, "color", view.themeBorder);
            item.implicitHeight = 1;
        }
    }

    function rebuild() {
        if (!host.pulsarMeta)
            host.pulsarMeta = contentMeta();

        reconcile(host, tree || [], true);

        if (PulsarBridge.env("PULSAR_DEBUG"))
            console.log("PulsarView built " + host.children.length);

        maybeTestClick();
    }
}
