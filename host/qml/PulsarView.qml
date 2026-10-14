import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Pulsar 1.0

ApplicationWindow {
    id: view

    visible: true
    property var tree: []

    onTreeChanged: rebuild()

    Item {
        id: host
        anchors.fill: parent
    }

    Timer {
        id: testClick
        onTriggered: {
            const clicked = clickFirst(host);
            if (Pulsar.env("PULSAR_DEBUG"))
                console.log("PulsarView test click " + clicked);
        }
    }

    function clickFirst(item) {
        const kids = item.children;
        for (let i = 0; i < kids.length; i++) {
            const child = kids[i];
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
        const ms = parseInt(Pulsar.env("PULSAR_UI_AUTOCLICK_MS") || "0");
        if (ms <= 0)
            return;
        testClick.interval = ms;
        testClick.restart();
    }

    function prop(obj, key, fallback) {
        return obj[key] !== undefined ? obj[key] : fallback;
    }

    function emitEvent(node, event, value) {
        Pulsar.emit("ui-event", {
            id: node.id,
            event: event,
            value: value
        });
    }

    function hasEvent(node, event) {
        return node.events !== undefined && node.events.indexOf(event) >= 0;
    }

    function applyCommon(item, node, props, isRoot) {
        if (props.width !== undefined)
            item.width = props.width;
        else if (isRoot && (node.type === "column" || node.type === "row" || node.type === "box"))
            item.width = host.width;

        if (props.height !== undefined)
            item.height = props.height;
        if (props.visible !== undefined)
            item.visible = props.visible;
        if (props.opacity !== undefined)
            item.opacity = props.opacity;
        if (props.expand)
            item.Layout.fillWidth = true;
    }

    function createNode(node, parent, isRoot) {
        const props = node.props || {};

        if (node.type === "column" || node.type === "row") {
            const layout = node.type === "column" ? "ColumnLayout" : "RowLayout";
            const item = Qt.createQmlObject("import QtQuick.Layouts; " + layout + " {}", parent, "pulsar-ui");
            item.spacing = prop(props, "gap", 0);
            applyCommon(item, node, props, isRoot);
            for (const child of node.children || [])
                createNode(child, item, false);
            return item;
        }

        if (node.type === "box") {
            const item = Qt.createQmlObject("import QtQuick; Rectangle {}", parent, "pulsar-ui");
            item.color = prop(props, "color", "transparent");
            item.radius = prop(props, "radius", 0);
            const inner = Qt.createQmlObject("import QtQuick.Layouts; ColumnLayout {}", item, "pulsar-ui");
            inner.anchors.fill = item;
            inner.anchors.margins = prop(props, "padding", 0);
            applyCommon(item, node, props, isRoot);
            for (const child of node.children || [])
                createNode(child, inner, false);
            return item;
        }

        if (node.type === "text") {
            const item = Qt.createQmlObject("import QtQuick.Controls; Label {}", parent, "pulsar-ui");
            item.text = prop(props, "text", "");
            if (props.color !== undefined)
                item.color = props.color;
            if (props.size !== undefined)
                item.font.pixelSize = props.size;
            if (props.bold)
                item.font.bold = true;
            if (props.wrap)
                item.wrapMode = Text.WordWrap;
            applyCommon(item, node, props, isRoot);
            return item;
        }

        if (node.type === "button") {
            const item = Qt.createQmlObject("import QtQuick.Controls; Button {}", parent, "pulsar-ui");
            item.text = prop(props, "label", "");
            if (props.enabled !== undefined)
                item.enabled = props.enabled;
            if (hasEvent(node, "click"))
                item.clicked.connect(function () {
                    emitEvent(node, "click");
                });
            applyCommon(item, node, props, isRoot);
            return item;
        }

        if (node.type === "textInput") {
            const item = Qt.createQmlObject("import QtQuick.Controls; TextField {}", parent, "pulsar-ui");
            item.text = prop(props, "value", "");
            item.placeholderText = prop(props, "placeholder", "");
            if (hasEvent(node, "input"))
                item.textEdited.connect(function (value) {
                    emitEvent(node, "input", value);
                });
            item.activeFocusChanged.connect(function () {
                emitEvent(node, item.activeFocus ? "focus" : "blur");
            });
            applyCommon(item, node, props, isRoot);
            return item;
        }

        if (node.type === "checkbox" || node.type === "switch") {
            const control = node.type === "checkbox" ? "CheckBox" : "Switch";
            const item = Qt.createQmlObject("import QtQuick.Controls; " + control + " {}", parent, "pulsar-ui");
            item.text = prop(props, "label", "");
            if (props.checked !== undefined)
                item.checked = props.checked;
            if (hasEvent(node, "toggle"))
                item.toggled.connect(function (value) {
                    emitEvent(node, "toggle", value);
                });
            applyCommon(item, node, props, isRoot);
            return item;
        }

        if (node.type === "slider") {
            const item = Qt.createQmlObject("import QtQuick.Controls; Slider {}", parent, "pulsar-ui");
            if (props.value !== undefined)
                item.value = props.value;
            if (props.min !== undefined)
                item.from = props.min;
            if (props.max !== undefined)
                item.to = props.max;
            if (hasEvent(node, "change"))
                item.moved.connect(function () {
                    emitEvent(node, "change", item.value);
                });
            applyCommon(item, node, props, isRoot);
            return item;
        }

        if (node.type === "image") {
            const item = Qt.createQmlObject("import QtQuick; Image {}", parent, "pulsar-ui");
            item.source = prop(props, "src", "");
            if (props.fillMode !== undefined)
                item.fillMode = props.fillMode;
            applyCommon(item, node, props, isRoot);
            return item;
        }

        if (node.type === "spacer") {
            const item = Qt.createQmlObject("import QtQuick; Item {}", parent, "pulsar-ui");
            item.Layout.preferredWidth = prop(props, "width", prop(props, "size", 0));
            item.Layout.preferredHeight = prop(props, "height", prop(props, "size", 0));
            return item;
        }

        const item = Qt.createQmlObject("import QtQuick; Rectangle {}", parent, "pulsar-ui");
        item.color = prop(props, "color", "#888888");
        item.Layout.fillWidth = true;
        item.Layout.preferredHeight = prop(props, "height", 1);
        return item;
    }

    function rebuild() {
        const kids = host.children;
        for (let i = kids.length - 1; i >= 0; i--)
            kids[i].destroy();

        for (const node of tree)
            createNode(node, host, true);

        if (Pulsar.env("PULSAR_DEBUG"))
            console.log("PulsarView built " + host.children.length);

        maybeTestClick();
    }
}
