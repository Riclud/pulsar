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
        } else if (node.type === "card") {
            item = make("import QtQuick; Rectangle { border.width: 1; property var pulsarMeta: null }", parent);
        } else if (node.type === "appBar") {
            item = appBarComponent.createObject(parent);
        } else if (node.type === "chip") {
            item = chipComponent.createObject(parent);
        } else if (node.type === "sheet") {
            item = sheetComponent.createObject(overlay);
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
    }

    function applyCommon(item, node, isRoot) {
        const props = node.props;
        const defaultFillWidth = node.type === "card" || node.type === "list" || node.type === "scroll"
                || node.type === "appBar" || node.type === "divider" || node.type === "textInput"
                || node.type === "textArea";
        const fill = prop(props, "fill", undefined);
        let fillWidth = defaultFillWidth;
        let fillHeight = node.type === "list" || node.type === "scroll";

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

        if (node.type === "sheet")
            return;

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

                if (props.maxLines !== undefined)
                    item.height = Math.min(item.height, item.contentHeight);

                item.implicitHeight = Qt.binding(function () {
                    return item.contentHeight;
                });
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
