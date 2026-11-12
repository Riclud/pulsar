import QtQuick
import QtQuick.Controls
import QtQuick.Controls.Material
import QtQuick.Layouts
import QtQuick.Effects
import QtQuick.Shapes
import "nodes"

ApplicationWindow {
    id: view

    visible: true
    font.family: fontFamily
    color: windowTransparent ? "transparent" : themeBackground

    LayoutMirroring.enabled: themeData && themeData.direction === "rtl"
    LayoutMirroring.childrenInherit: true
    readonly property bool layoutMirrored: LayoutMirroring.enabled

    Material.theme: themeBackground.hsvValue < 0.5 ? Material.Dark : Material.Light
    Material.background: themeSurface
    Material.foreground: themeText
    Material.primary: themePrimary
    Material.accent: themePrimary
    property bool windowTransparent: false
    readonly property var flingCurve: makeFlingCurve()
    readonly property bool effectsAvailable: host.GraphicsInfo.api !== GraphicsInfo.Software
    property var tappedItems: []
    property var videoComponent: null
    readonly property bool debugging: PulsarBridge.env("PULSAR_DEBUG") ? true : false
    property var nativeRenderer: null
    readonly property Item nativeHost: host
    readonly property Component nativeFlickable: flickableComponent
    readonly property Component nativeClickableBox: clickableBoxComponent
    readonly property Component nativeStateBox: stateBoxComponent
    readonly property Component nativeButton: buttonComponent
    readonly property Component nativeIconButton: nativeIconButtonComponent
    readonly property Component nativeCheckbox: checkboxComponent
    readonly property Component nativeSwitch: switchComponent
    readonly property Component nativeChip: chipComponent
    readonly property Component nativeProgress: progressBarComponent
    readonly property Component nativeSpinner: spinnerComponent
    readonly property Component nativeBadge: badgeComponent
    readonly property Component nativeAvatar: avatarComponent
    readonly property Component nativeTextField: textFieldComponent
    readonly property Component nativeTextArea: textAreaComponent
    property var gapLayouts: []
    property var madeComponents: ({})
    property bool reordering: false
    property int revealTicks: 0
    // `dialog.toast` on the desktop: { seq, text } from the host.
    property var toastRequest: null
    property var scrollPositions: ({})
    property var nodeItems: ({})
    property bool patchShallow: false
    property bool motionReady: false
    property int creatingNodes: 0
    property var uiStats: ({ created: 0, updated: 0, removed: 0, reordered: 0 })
    property string errorText: ""
    property bool testClicked: false
    property var themeData: ({})

    readonly property var themePalette: themeData && themeData.palette ? themeData.palette : ({})
    readonly property var themeColors: themeData && themeData.colors ? themeData.colors : ({})
    readonly property real fontScale: themeData && themeData.fontScale !== undefined ? themeData.fontScale : 1
    readonly property real density: themeData && themeData.density !== undefined ? themeData.density : 1
    readonly property bool darkMode: PulsarBridge.colorScheme === "dark"
    readonly property color themeLayer0: themePalette.background !== undefined ? themePalette.background : (darkMode ? "#303446" : "#eff1f5")
    readonly property color themeLayer1: themePalette.surface !== undefined ? themePalette.surface : (darkMode ? "#414559" : "#ccd0da")
    readonly property color themeLayer2: themePalette.surfaceVariant !== undefined ? themePalette.surfaceVariant : (darkMode ? "#51576d" : "#bcc0cc")
    readonly property color themeLayer3: themePalette.layer3 !== undefined ? themePalette.layer3 : (darkMode ? "#626880" : "#acb0be")
    readonly property color themeLayer4: themePalette.layer4 !== undefined ? themePalette.layer4 : (darkMode ? "#737994" : "#9ca0b0")
    readonly property color themeBackground: themeLayer0
    readonly property color themeSurface: themeLayer1
    readonly property color themeSurfaceVariant: themeLayer2
    readonly property color themePrimary: themePalette.primary !== undefined ? themePalette.primary : (darkMode ? "#ca9ee6" : "#8839ef")
    readonly property color themeText: themePalette.text !== undefined ? themePalette.text : (darkMode ? "#c6d0f5" : "#4c4f69")
    readonly property color themeTextSecondary: themePalette.textSecondary !== undefined ? themePalette.textSecondary : (darkMode ? "#a5adce" : "#6c6f85")
    readonly property color themeBorder: themePalette.border !== undefined ? themePalette.border : (darkMode ? "#626880" : "#acb0be")
    readonly property color themeOnPrimary: darkMode ? "#232634" : "#ffffff"
    readonly property color themeShadow: "#000000"
    readonly property int themeRadius: Math.round((themePalette.radius !== undefined ? themePalette.radius : 12) * density)
    readonly property int themeWindowRadius: 18
    readonly property int themeSpacing: Math.round((themePalette.spacing !== undefined ? themePalette.spacing : 8) * density)
    readonly property int motionFast: themeData && themeData.motion && themeData.motion.fast !== undefined ? themeData.motion.fast : 300
    readonly property int motionNormal: themeData && themeData.motion && themeData.motion.normal !== undefined ? themeData.motion.normal : 450
    readonly property int motionSlow: themeData && themeData.motion && themeData.motion.slow !== undefined ? themeData.motion.slow : 600
    readonly property string transitionMode: PulsarBridge.env("PULSAR_TRANSITION") || "fade"
    readonly property var motionCurve: [0.38, 1.21, 0.22, 1.00, 1, 1]
    readonly property string iconFamily: themeData && themeData.iconFamily !== undefined
            ? themeData.iconFamily
            : iconFont.name
    readonly property string fontFamily: themeData && themeData.fontFamily !== undefined ? themeData.fontFamily : "Noto Sans"
    readonly property bool embeddedHost: typeof PulsarEmbedded !== "undefined" && PulsarEmbedded
    // Node files in nodes/ get the window as `view: viewRef`; `view: view` would bind
    // their own property to itself.
    readonly property Window viewRef: view
    readonly property alias revealMotion: revealMotion
    readonly property alias textCursorComponent: textCursorComponent
    property var revealTarget: null
    property var keyboardFlicks: ({})
    property string inspectText: ""

    function reportWindowSize() {
        if (typeof PulsarBridge === "undefined")
            return;

        PulsarBridge.emit("__event", {
            name: "window-resize",
            data: {
                label: typeof PulsarWindowLabel !== "undefined" ? PulsarWindowLabel : "main",
                width: Math.round(width),
                height: Math.round(height)
            }
        });
    }

    onWidthChanged: sizeReportTimer.restart()
    onHeightChanged: {
        sizeReportTimer.restart();
        keyboardRevealTimer.restart();
    }
    Component.onCompleted: sizeReportTimer.start()

    Timer {
        id: sizeReportTimer

        interval: 60
        onTriggered: view.reportWindowSize()
    }

    function findFloatingLabel(root) {
        const stack = [root];

        while (stack.length > 0) {
            const node = stack.pop();

            if (!node || !node.children)
                continue;

            const children = node.children;

            for (let i = 0; i < children.length; i++) {
                const child = children[i];

                if (!child)
                    continue;

                if (child.largestHeight !== undefined)
                    return child;

                if (child.children && child.children.length > 0)
                    stack.push(child);
            }
        }

        return null;
    }

    function fs(px) {
        return Math.round(px * fontScale);
    }

    function resolveColor(value, fallback) {
        if (value === undefined || value === null)
            return fallback;

        const colors = view.themeColors;

        if (colors && colors[value] !== undefined)
            return colors[value];

        return value;
    }

    function mixColor(a, b, t) {
        return Qt.rgba(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, a.a + (b.a - a.a) * t);
    }

    function withAlpha(c, alpha) {
        let base = c;

        // A colour from the app is a string, which has no r, g and b of its own.
        if (typeof c === "string") {
            try {
                base = Qt.color(c);
            } catch (error) {
                base = Qt.rgba(0, 0, 0, 1);
            }
        }

        return Qt.rgba(base.r, base.g, base.b, alpha);
    }

    function hoverColor(base) {
        return mixColor(base, themeText, 0.08);
    }

    function activeColor(base) {
        return mixColor(base, themeText, 0.14);
    }

    function disabledColor(base) {
        return withAlpha(mixColor(base, themeBackground, 0.6), 0.5);
    }

    function applyTabPalette(bar) {
        const palette = bar.palette;

        palette.window = view.themeBackground;
        palette.base = view.themeBackground;
        palette.button = view.themeSurface;
        palette.buttonText = view.themeText;
        palette.text = view.themeText;
        palette.highlight = view.themePrimary;
        palette.highlightedText = view.themeBackground;
        palette.accent = view.themePrimary;
    }

    function fontWeight(value) {
        if (typeof value === "number")
            return value;

        if (value === "light")
            return 300;
        if (value === "medium")
            return 500;
        if (value === "semibold")
            return 600;
        if (value === "bold")
            return 700;

        return 400;
    }

    function applyGradient(item, gradient) {
        const extra = item.pulsarMeta.extra;

        if (!gradient) {
            if (item.gradient !== null)
                item.gradient = null;

            return;
        }

        let stops = extra.gradientStops;

        if (!stops) {
            const shape = make(
                        "import QtQuick; Gradient { GradientStop { position: 0 } GradientStop { position: 1 } }",
                        item);

            stops = [shape.stops[0], shape.stops[1]];

            extra.gradientShape = shape;
            extra.gradientStops = stops;
        }

        extra.gradientShape.orientation = gradient.direction === "horizontal"
                ? Gradient.Horizontal : Gradient.Vertical;
        stops[0].color = resolveColor(gradient.from, "transparent");
        stops[1].color = resolveColor(gradient.to, "transparent");

        if (item.gradient !== extra.gradientShape)
            item.gradient = extra.gradientShape;
    }

    function applyElevation(item, level, color) {
        if (item.pulsarElevation === undefined)
            return;

        const value = Math.max(0, Number(level) || 0);

        if (item.pulsarElevation !== value)
            item.pulsarElevation = value;

        if (color !== undefined)
            item.pulsarShadowColor = resolveColor(color, view.themeShadow);
    }

    FontLoader {
        id: iconFont
        source: "qrc:/runtime/fonts/MaterialIcons.ttf"
    }

    Rectangle {
        anchors.fill: parent
        radius: view.themeWindowRadius
        color: view.withAlpha(view.themeBackground, 0.82)
        border.width: view.windowTransparent ? 1 : 0
        border.color: view.themeBorder
        visible: view.windowTransparent
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

        Image {
            id: transitionSnapshot

            property var grabResult: null

            x: host.x
            y: host.y
            width: host.width
            height: host.height
            fillMode: Image.Stretch
            smooth: true
            visible: false
            opacity: 0
            z: -1
        }
    }

    Rectangle {
        id: inspector

        anchors.top: parent.top
        anchors.right: parent.right
        anchors.margins: 8
        width: inspectorLabel.implicitWidth + 16
        height: inspectorLabel.implicitHeight + 12
        radius: 8
        color: view.withAlpha(view.themeBackground, 0.9)
        border.width: 1
        border.color: view.themeBorder
        z: 3000
        visible: PulsarBridge.env("PULSAR_INSPECTOR") !== ""

        Label {
            id: inspectorLabel

            anchors.centerIn: parent
            text: view.inspectText
            color: view.themeText
            font.family: "monospace"
            font.pixelSize: 11
        }
    }

    // Android shows a native toast; the desktop draws one like it at the bottom of the window.
    Rectangle {
        id: toast

        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 72
        width: Math.min(toastLabel.implicitWidth + 32, parent.width - 32)
        height: toastLabel.implicitHeight + 20
        radius: 8
        color: view.withAlpha(view.themeText, 0.92)
        opacity: 0
        visible: opacity > 0
        z: 2500

        Behavior on opacity {
            NumberAnimation {
                duration: 180
                easing.type: Easing.OutCubic
            }
        }

        Label {
            id: toastLabel

            anchors.centerIn: parent
            width: Math.min(implicitWidth, toast.parent.width - 64)
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.Wrap
            color: view.themeBackground
            font.family: view.fontFamily
            font.pixelSize: view.fs(13)
        }

        Timer {
            id: toastTimer

            interval: 2200
            onTriggered: toast.opacity = 0
        }
    }

    onToastRequestChanged: {
        if (!toastRequest || !toastRequest.text)
            return;

        toastLabel.text = toastRequest.text;
        toast.opacity = 1;
        toastTimer.restart();
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
                font.pixelSize: view.fs(20)
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
        id: motionComponent

        MotionNode {
            view: viewRef
        }
    }

    Component {
        id: dragComponent

        DragNode {
            view: viewRef
        }
    }

    Component {
        id: arrangeComponent

        ArrangeNode {
        }
    }

    Component {
        id: canvasComponent

        CanvasNode {
            view: viewRef
        }
    }

    Component {
        id: columnComponent

        ColumnLayout {
            property var pulsarMeta: null
        }
    }

    Component {
        id: rowComponent

        RowLayout {
            property var pulsarMeta: null
        }
    }

    Component {
        id: itemComponent

        Item {
            property var pulsarMeta: null
        }
    }

    Component {
        id: labelComponent

        Label {
            property var pulsarMeta: null
        }
    }

    Component {
        id: textComponent

        Text {
            property var pulsarMeta: null
        }
    }

    Component {
        id: selectableTextComponent

        TextEdit {
            readOnly: true
            selectByMouse: true
            property var pulsarMeta: null
        }
    }

    Component {
        id: toolButtonComponent

        ToolButton {
            property var pulsarMeta: null
        }
    }

    Component {
        id: nativeIconButtonComponent

        IconButtonNode {
            view: viewRef
        }
    }

    Component {
        id: sliderComponent

        Slider {
            property var pulsarMeta: null
        }
    }

    Component {
        id: comboBoxComponent

        ComboBox {
            property var pulsarMeta: null
        }
    }

    Component {
        id: progressBarComponent

        ProgressBar {
            property var pulsarMeta: null
        }
    }

    Component {
        id: imageComponent

        Image {
            property var pulsarMeta: null
        }
    }

    Component {
        id: rectangleComponent

        Rectangle {
            property var pulsarMeta: null
        }
    }

    Component {
        id: clickableBoxComponent

        ClickableBoxNode {
            view: viewRef
        }
    }

    Component {
        id: stateBoxComponent

        StateBoxNode {
            view: viewRef
        }
    }

    Component {
        id: flickableComponent

        FlickableNode {
            view: viewRef
        }
    }

    Component {
        id: boxComponent

        BoxNode {
            view: viewRef
        }
    }

    Component {
        id: cardComponent

        CardNode {
            view: viewRef
        }
    }

    Component {
        id: appBarComponent

        AppBarNode {
            view: viewRef
        }
    }

    Component {
        id: chipComponent

        ChipNode {
            view: viewRef
        }
    }

    Component {
        id: buttonComponent

        ButtonNode {
            view: viewRef
        }
    }

    Component {
        id: textCursorComponent

        Rectangle {
            id: textCursor

            width: 2
            color: view.themePrimary
            visible: parent.activeFocus && !parent.readOnly
                    && parent.selectionStart === parent.selectionEnd
            opacity: 1

            Timer {
                running: textCursor.visible
                interval: Math.max(1, Application.styleHints.cursorFlashTime / 2)
                repeat: true
                onTriggered: textCursor.opacity = textCursor.opacity > 0 ? 0 : 1
                onRunningChanged: textCursor.opacity = 1
            }
        }
    }

    Component {
        id: textFieldComponent

        TextFieldNode {
            view: viewRef
        }
    }

    Component {
        id: textAreaComponent

        TextAreaNode {
            view: viewRef
        }
    }

    Component {
        id: checkboxComponent

        CheckboxNode {
            view: viewRef
        }
    }

    Component {
        id: switchComponent

        SwitchNode {
            view: viewRef
        }
    }

    Component {
        id: avatarComponent

        AvatarNode {
            view: viewRef
        }
    }

    Component {
        id: badgeComponent

        BadgeNode {
            view: viewRef
        }
    }

    Component {
        id: skeletonComponent

        SkeletonNode {
            view: viewRef
        }
    }

    Component {
        id: spinnerComponent

        SpinnerNode {
            view: viewRef
        }
    }

    Component {
        id: sheetComponent

        SheetNode {
            view: viewRef
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

                background: Rectangle {
                    color: view.themeBackground
                }

                Repeater {
                    model: tabsRoot.tabItems

                    TabButton {
                        id: tabButton

                        text: modelData.label

                        onClicked: view.emitNodeEvent(tabsRoot.nodeData, "change", index)

                        palette.window: view.themeBackground
                        palette.windowText: view.themeText
                        palette.brightText: view.themeTextSecondary
                        palette.dark: view.themeSurfaceVariant
                        palette.mid: view.themeSurface
                        palette.highlight: view.themePrimary
                        palette.highlightedText: view.themeBackground

                        HoverHandler {
                            cursorShape: Qt.PointingHandCursor
                        }

                        background: Rectangle {
                            implicitHeight: 40
                            color: tabButton.checked ? view.themeSurface
                                    : tabButton.hovered ? view.hoverColor(view.themeBackground)
                                    : view.themeBackground

                            Behavior on color {
                                ColorAnimation {
                                    duration: view.motionFast
                                    easing.type: Easing.BezierSpline
                                    easing.bezierCurve: view.motionCurve
                                }
                            }

                            Rectangle {
                                anchors.bottom: parent.bottom
                                width: parent.width
                                height: 2
                                visible: tabButton.checked
                                color: view.themePrimary
                            }
                        }
                    }
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

            background: Rectangle {
                radius: view.themeRadius
                color: view.themeSurface
            }

            Repeater {
                model: segmentedRoot.tabItems

                TabButton {
                    id: segmentButton

                    text: modelData.label

                    // Only a press is a change; QML also moves currentIndex while
                    // the bar is built, and that must not reach the app.
                    onClicked: view.emitNodeEvent(segmentedRoot.nodeData, "change", index)

                    palette.window: view.themeSurface
                    palette.windowText: view.themeText
                    palette.brightText: view.themeTextSecondary
                    palette.dark: view.themeSurfaceVariant
                    palette.mid: view.themeSurfaceVariant

                    HoverHandler {
                        cursorShape: Qt.PointingHandCursor
                    }

                    background: Rectangle {
                        implicitHeight: 36
                        radius: Math.max(0, view.themeRadius - 2)
                        color: segmentButton.checked ? view.themeSurfaceVariant
                                : segmentButton.hovered ? view.withAlpha(view.themeText, 0.06)
                                : "transparent"

                        Behavior on color {
                            ColorAnimation {
                                duration: view.motionFast
                                easing.type: Easing.BezierSpline
                                easing.bezierCurve: view.motionCurve
                            }
                        }
                    }
                }
            }

        }
    }

    Component {
        id: navRailComponent

        RowLayout {
            id: railRoot

            spacing: view.themeSpacing
            property var pulsarMeta: null
            property var nodeData: null
            property var navItems: []
            property bool expanded: true
            property bool syncing: false
            property int currentIndex: 0
            property alias contentLayout: railStack

            Rectangle {
                Layout.fillHeight: true
                Layout.preferredWidth: railRoot.expanded ? 180 : 56
                radius: view.themeRadius
                color: view.themeSurface
                border.width: 1
                border.color: view.themeBorder

                ColumnLayout {
                    id: railColumn

                    anchors.fill: parent
                    anchors.margins: 6
                    spacing: 4

                    Repeater {
                        model: railRoot.navItems

                        Rectangle {
                            id: navButton

                            Layout.fillWidth: true
                            Layout.preferredHeight: 44
                            radius: view.themeRadius
                            color: railRoot.currentIndex === index ? view.themeSurfaceVariant : "transparent"

                            Behavior on color {
                                ColorAnimation {
                                    duration: view.motionFast
                                    easing.type: Easing.BezierSpline
                                    easing.bezierCurve: view.motionCurve
                                }
                            }

                            HoverHandler {
                                cursorShape: Qt.PointingHandCursor
                            }

                            RowLayout {
                                anchors.fill: parent
                                anchors.leftMargin: 12
                                anchors.rightMargin: 8
                                spacing: 10

                                Label {
                                    visible: modelData.icon !== undefined && modelData.icon.length > 0
                                    text: visible ? modelData.icon : ""
                                    font.family: view.iconFamily
                                    font.pixelSize: view.fs(22)
                                    color: railRoot.currentIndex === index ? view.themePrimary : view.themeText
                                }

                                Label {
                                    Layout.fillWidth: true
                                    visible: railRoot.expanded
                                    text: modelData.label
                                    font.family: view.fontFamily
                                    font.pixelSize: view.fs(15)
                                    color: railRoot.currentIndex === index ? view.themePrimary : view.themeText
                                    elide: Text.ElideRight
                                }
                            }

                            MouseArea {
                                anchors.fill: parent
                                onClicked: {
                                    if (railRoot.syncing)
                                        return;

                                    railRoot.currentIndex = index;
                                    view.emitNodeEvent(railRoot.nodeData, "change", index);
                                }
                            }
                        }
                    }

                    Item {
                        Layout.fillHeight: true
                    }
                }
            }

            StackLayout {
                id: railStack

                Layout.fillWidth: true
                Layout.fillHeight: true
                currentIndex: railRoot.currentIndex
                property var pulsarMeta: null
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

                property int pulsarElevation: 0
                property color pulsarShadowColor: view.themeShadow

                width: Math.min(parent.width - 32, 320)
                radius: view.themeRadius
                color: view.themeSurface
                border.width: 1
                border.color: view.themeBorder
                x: 16
                y: 16
                transformOrigin: Item.Center
                scale: popRoot.open ? 1 : 0.96

                Behavior on scale {
                    NumberAnimation {
                        duration: view.motionFast
                        easing.type: Easing.BezierSpline
                        easing.bezierCurve: view.motionCurve
                    }
                }

                layer.enabled: view.effectsAvailable && pulsarElevation > 0
                layer.effect: MultiEffect {
                    shadowEnabled: true
                    autoPaddingEnabled: true
                    shadowColor: popPanel.pulsarShadowColor
                    shadowBlur: Math.min(1, 0.2 + popPanel.pulsarElevation * 0.15)
                    shadowOpacity: Math.min(0.5, 0.12 + popPanel.pulsarElevation * 0.04)
                    shadowVerticalOffset: popPanel.pulsarElevation * 2
                }

                MouseArea {
                    anchors.fill: parent
                }

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
        id: radioComponent

        RadioNode {
            view: viewRef
        }
    }

    Component {
        id: radioGroupComponent

        RadioGroupNode {
            view: viewRef
        }
    }

    Component {
        id: accordionComponent

        ColumnLayout {
            id: accordionRoot

            property var pulsarMeta: null
            property var nodeData: null
            property bool multiple: true

            spacing: view.themeSpacing

            function closeOthers(section) {
                for (let i = 0; i < children.length; i++) {
                    const child = children[i];

                    if (child !== section && child.setOpen !== undefined)
                        child.setOpen(false);
                }
            }
        }
    }

    Component {
        id: accordionSectionComponent

        Rectangle {
            id: sectionRoot

            property var pulsarMeta: null
            property var nodeData: null
            property var accordionRoot: null
            property string title: ""
            property string subtitle: ""
            property string iconName: ""
            property bool opened: false
            property bool sectionEnabled: true
            property alias contentLayout: sectionContent

            implicitHeight: sectionColumn.implicitHeight
            radius: view.themeRadius
            color: view.themeSurface
            border.width: 1
            border.color: view.themeBorder
            opacity: sectionEnabled ? 1 : 0.55

            Behavior on implicitHeight {
                NumberAnimation {
                    duration: view.motionFast
                    easing.type: Easing.BezierSpline
                    easing.bezierCurve: view.motionCurve
                }
            }

            function setOpen(value) {
                if (opened === value)
                    return;

                opened = value;
            }

            function toggle() {
                if (!sectionEnabled)
                    return;

                const next = !opened;

                if (next && accordionRoot && accordionRoot.multiple === false)
                    accordionRoot.closeOthers(sectionRoot);

                opened = next;

                if (accordionRoot && accordionRoot.nodeData) {
                    const index = accordionRoot.children.indexOf(sectionRoot);

                    view.emitNodeEvent(accordionRoot.nodeData, "toggle", { index: index, open: opened });
                    return;
                }

                view.emitNodeEvent(nodeData, "toggle", opened);
            }

            Column {
                id: sectionColumn

                width: parent.width

                Item {
                    id: sectionHeader

                    width: parent.width
                    height: sectionRoot.subtitle.length > 0 ? 58 : 50

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: sectionRoot.toggle()
                    }

                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 14
                        anchors.rightMargin: 12
                        spacing: 10

                        Label {
                            visible: text.length > 0
                            text: sectionRoot.iconName
                            font.family: view.iconFamily
                            font.pixelSize: view.fs(20)
                            color: sectionRoot.opened ? view.themePrimary : view.themeTextSecondary
                        }

                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 0

                            Label {
                                Layout.fillWidth: true
                                text: sectionRoot.title
                                elide: Text.ElideRight
                                color: view.themeText
                                font.family: view.fontFamily
                                font.pixelSize: view.fs(15)
                                font.weight: 600
                            }

                            Label {
                                Layout.fillWidth: true
                                visible: text.length > 0
                                text: sectionRoot.subtitle
                                elide: Text.ElideRight
                                color: view.themeTextSecondary
                                font.family: view.fontFamily
                                font.pixelSize: view.fs(12)
                            }
                        }

                        Label {
                            text: "expand_more"
                            font.family: view.iconFamily
                            font.pixelSize: view.fs(20)
                            color: view.themeTextSecondary
                            rotation: sectionRoot.opened ? 180 : 0

                            Behavior on rotation {
                                NumberAnimation {
                                    duration: view.motionFast
                                    easing.type: Easing.BezierSpline
                                    easing.bezierCurve: view.motionCurve
                                }
                            }
                        }
                    }
                }

                Item {
                    id: sectionBody

                    width: parent.width
                    height: sectionRoot.opened ? sectionContent.implicitHeight + 12 : 0
                    clip: true

                    ColumnLayout {
                        id: sectionContent

                        x: 12
                        width: parent.width - 24
                        spacing: view.themeSpacing
                        opacity: sectionRoot.opened ? 1 : 0
                        property var pulsarMeta: null

                        Behavior on opacity {
                            NumberAnimation { duration: view.motionFast }
                        }
                    }
                }
            }
        }
    }

    Component {
        id: menuComponent

        Item {
            id: menuRoot

            anchors.fill: parent
            visible: open || opacity > 0
            opacity: open ? 1 : 0
            z: 700
            focus: open
            property bool open: false
            property bool modal: false
            property bool dismissible: true
            property bool closeOnSelect: true
            property int fadeDuration: 120
            property real openedAT: 0
            property real menuWidth: 220
            property real maxHeight: 360
            property var pulsarMeta: null
            property var nodeData: null
            property var items: []
            property alias panel: menuPanel

            Behavior on opacity {
                NumberAnimation {
                    duration: menuRoot.fadeDuration
                    easing.type: Easing.OutCubic
                }
            }

            onOpenChanged: {
                if (!open)
                    return;

                openedAT = Date.now();
                forceActiveFocus();
            }

            Keys.onEscapePressed: view.emitNodeEvent(menuRoot.nodeData, "close")

            Rectangle {
                anchors.fill: parent
                color: menuRoot.modal ? "#66000000" : "transparent"

                MouseArea {
                    anchors.fill: parent
                    onClicked: {
                        if (!menuRoot.dismissible)
                            return;
                        if (Date.now() - menuRoot.openedAT < 250)
                            return;
                        view.emitNodeEvent(menuRoot.nodeData, "close");
                    }
                }
            }

            Rectangle {
                id: menuPanel

                property int pulsarElevation: 3
                property color pulsarShadowColor: view.themeShadow

                x: 16
                y: 16
                width: menuRoot.menuWidth
                height: Math.min(menuRoot.maxHeight, menuColumn.implicitHeight + 12)
                radius: view.themeRadius
                color: view.themeSurface
                border.width: 1
                border.color: view.themeBorder
                clip: true
                layer.enabled: view.effectsAvailable && pulsarElevation > 0

                layer.effect: MultiEffect {
                    shadowEnabled: true
                    autoPaddingEnabled: true
                    shadowColor: menuPanel.pulsarShadowColor
                    shadowBlur: Math.min(1, 0.2 + menuPanel.pulsarElevation * 0.15)
                    shadowOpacity: Math.min(0.5, 0.12 + menuPanel.pulsarElevation * 0.04)
                    shadowVerticalOffset: menuPanel.pulsarElevation * 2
                }

                MouseArea {
                    anchors.fill: parent
                }

                Flickable {
                    anchors.fill: parent
                    anchors.margins: 6
                    clip: true
                    contentWidth: width
                    contentHeight: menuColumn.implicitHeight
                    boundsBehavior: Flickable.StopAtBounds

                    Column {
                        id: menuColumn

                        width: parent.width

                        Repeater {
                            model: menuRoot.items

                            delegate: Item {
                                id: menuRow

                                required property var modelData
                                required property int index

                                readonly property bool isSeparator: modelData && modelData.separator === true
                                readonly property bool isDisabled: !isSeparator && (modelData.disabled === true || modelData.enabled === false)

                                width: menuColumn.width
                                height: isSeparator ? 9 : 34

                                Rectangle {
                                    anchors.fill: parent
                                    visible: !menuRow.isSeparator
                                    radius: 8
                                    color: menuRow.isDisabled ? "transparent"
                                            : rowMouse.containsMouse ? view.withAlpha(view.themeText, 0.08) : "transparent"
                                }

                                Rectangle {
                                    anchors.verticalCenter: parent.verticalCenter
                                    x: 4
                                    width: parent.width - 8
                                    height: 1
                                    visible: menuRow.isSeparator
                                    color: view.themeBorder
                                }

                                RowLayout {
                                    anchors.fill: parent
                                    anchors.leftMargin: 10
                                    anchors.rightMargin: 10
                                    spacing: 10
                                    visible: !menuRow.isSeparator

                                    Label {
                                        visible: text.length > 0
                                        text: menuRow.modelData.icon || ""
                                        font.family: view.iconFamily
                                        font.pixelSize: view.fs(18)
                                        color: menuRow.isDisabled ? view.themeTextSecondary
                                                : menuRow.modelData.danger === true ? view.resolveColor("red", "#e78284")
                                                : view.themeText
                                    }

                                    Label {
                                        Layout.fillWidth: true
                                        text: menuRow.modelData.label || ""
                                        elide: Text.ElideRight
                                        color: menuRow.isDisabled ? view.themeTextSecondary
                                                : menuRow.modelData.danger === true ? view.resolveColor("red", "#e78284")
                                                : view.themeText
                                        font.family: view.fontFamily
                                        font.pixelSize: view.fs(14)
                                    }

                                    Label {
                                        visible: text.length > 0
                                        text: menuRow.modelData.shortcut || ""
                                        color: view.themeTextSecondary
                                        font.family: view.fontFamily
                                        font.pixelSize: view.fs(11)
                                    }
                                }

                                MouseArea {
                                    id: rowMouse

                                    anchors.fill: parent
                                    enabled: !menuRow.isSeparator && !menuRow.isDisabled
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: {
                                        view.emitNodeEvent(menuRoot.nodeData, "select", menuRow.modelData.id);

                                        if (menuRoot.closeOnSelect)
                                            view.emitNodeEvent(menuRoot.nodeData, "close");
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Component {
        id: fabComponent

        FabNode {
            view: viewRef
        }
    }

    Component {
        id: searchFieldComponent

        SearchFieldNode {
            view: viewRef
        }
    }

    Component {
        id: rangeSliderComponent

        RangeSliderNode {
            view: viewRef
        }
    }

    Component {
        id: neonComponent

        Item {
            id: neonRoot

            property var pulsarMeta: null
            property var nodeData: null
            property alias contentLayout: neonContent
            property int pad: 24
            property color neonColor: view.themePrimary
            property real neonIntensity: 1
            property real neonGlow: 0.8
            property bool effectsRequested: true
            readonly property bool effectsSupported: neonRoot.effectsRequested
                    && GraphicsInfo.api !== GraphicsInfo.Software

            implicitWidth: neonContent.implicitWidth + pad * 2
            implicitHeight: neonContent.implicitHeight + pad * 2

            Item {
                id: neonSurface

                anchors.fill: parent

                ColumnLayout {
                    id: neonContent

                    anchors.fill: parent
                    anchors.margins: neonRoot.pad
                    spacing: 0
                    property var pulsarMeta: null
                }
            }

            Loader {
                anchors.fill: parent
                z: -1
                active: neonRoot.effectsSupported
                sourceComponent: MultiEffect {
                    source: neonSurface
                    autoPaddingEnabled: true
                    shadowEnabled: true
                    shadowColor: neonRoot.neonColor
                    shadowBlur: 1
                    shadowOpacity: Math.min(1, Math.max(0, neonRoot.neonGlow * neonRoot.neonIntensity))
                    shadowHorizontalOffset: 0
                    shadowVerticalOffset: 0
                }
            }

            Rectangle {
                anchors.fill: neonSurface
                anchors.margins: neonRoot.pad - 2
                radius: view.themeRadius + 2
                color: "transparent"
                border.width: neonRoot.effectsSupported ? 0 : 2
                border.color: view.withAlpha(neonRoot.neonColor, Math.min(1, neonRoot.neonGlow * neonRoot.neonIntensity))
            }

        }
    }

    Component {
        id: navBarComponent

        Rectangle {
            id: navRoot

            property var pulsarMeta: null
            property var nodeData: null
            property var items: []
            property int currentIndex: 0
            property color barColor: view.themeSurface
            property color accent: view.themePrimary
            property bool showLabels: true

            implicitHeight: showLabels ? 62 : 50
            radius: view.themeRadius
            color: barColor
            border.width: 1
            border.color: view.themeBorder

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 6
                anchors.rightMargin: 6
                anchors.topMargin: 4
                anchors.bottomMargin: 4
                spacing: 2

                Repeater {
                    model: navRoot.items

                    delegate: Item {
                        id: navItem

                        required property var modelData
                        required property int index

                        Layout.fillWidth: true
                        Layout.fillHeight: true

                        readonly property bool selected: navRoot.currentIndex === navItem.index

                        Rectangle {
                            anchors.fill: parent
                            radius: view.themeRadius
                            color: navItem.selected ? view.themeSurfaceVariant : "transparent"

                            Behavior on color {
                                ColorAnimation {
                                    duration: view.motionFast
                                    easing.type: Easing.BezierSpline
                                    easing.bezierCurve: view.motionCurve
                                }
                            }
                        }

                        ColumnLayout {
                            anchors.centerIn: parent
                            spacing: 2

                            Label {
                                Layout.alignment: Qt.AlignHCenter
                                visible: text.length > 0
                                text: navItem.modelData.icon !== undefined ? navItem.modelData.icon : ""
                                font.family: view.iconFamily
                                font.pixelSize: view.fs(22)
                                color: navItem.selected ? navRoot.accent : view.themeTextSecondary
                            }

                            Label {
                                Layout.alignment: Qt.AlignHCenter
                                visible: navRoot.showLabels
                                text: navItem.modelData.label
                                font.family: view.fontFamily
                                font.pixelSize: view.fs(11)
                                color: navItem.selected ? navRoot.accent : view.themeTextSecondary
                            }
                        }

                        HoverHandler {
                            cursorShape: Qt.PointingHandCursor
                        }

                        MouseArea {
                            anchors.fill: parent
                            onClicked: {
                                if (navItem.selected)
                                    return;

                                navRoot.currentIndex = navItem.index;
                                view.emitNodeEvent(navRoot.nodeData, "change", navItem.index);
                            }
                        }
                    }
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
        id: qmlComponent

        Loader {
            id: qmlLoader

            asynchronous: false
            property var pulsarMeta: null
            property var nodeData: null
            property string pulsarPath: ""
            property var pulsarEmit: null

            onLoaded: view.applyQmlProps(qmlLoader, qmlLoader.pulsarMeta ? qmlLoader.pulsarMeta.node : null)

            // The loaded item is deleted later; a player in it must not play until then.
            Component.onDestruction: view.releaseMedia(qmlLoader.item)
        }
    }

    Component {
        id: gridComponent

        GridNode {
            view: viewRef
        }
    }

    Component {
        id: virtualRowsComponent

        VirtualRowsNode {
            view: viewRef
        }
    }

    Component {
        id: virtualListComponent

        VirtualListNode {
            view: viewRef
        }
    }









    NumberAnimation {
        id: fadeIn

        target: host
        property: "opacity"
        from: 0
        to: 1
        duration: Math.round(view.motionFast * 0.6)
        easing.type: Easing.BezierSpline
        easing.bezierCurve: view.motionCurve
    }

    function playTransition(result) {
        if (!result)
            return;

        if (PulsarBridge.env("PULSAR_DEBUG"))
            console.log("PulsarView transition");

        transitionSnapshot.grabResult = result;
        transitionSnapshot.source = result.url;
        transitionSnapshot.visible = true;
        transitionSnapshot.opacity = 1;
        transitionAnim.restart();
    }

    SequentialAnimation {
        id: transitionAnim

        PropertyAction {
            target: transitionSnapshot
            property: "opacity"
            value: 1
        }
        NumberAnimation {
            target: transitionSnapshot
            property: "opacity"
            to: 0
            duration: Math.round(view.motionFast * 0.6)
            easing.type: Easing.BezierSpline
            easing.bezierCurve: view.motionCurve
        }
        PropertyAction {
            target: transitionSnapshot
            property: "visible"
            value: false
        }
        ScriptAction {
            script: {
                transitionSnapshot.source = "";
                transitionSnapshot.grabResult = null;
            }
        }
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

    property int building: 0
    property var heldEvents: []

    // An in-process runtime answers an event at once; if that happened while
    // a patch or rebuild is half done, the answer would patch a tree that is
    // still being built. Events raised during a build wait until it ends.
    Timer {
        id: heldEventsTimer

        interval: 0
        onTriggered: {
            const events = view.heldEvents;

            view.heldEvents = [];

            for (const payload of events)
                PulsarBridge.emit("ui-event", payload);
        }
    }

    function emitEvent(node, event, value) {
        if (!node)
            return;

        if (event === "click")
            Qt.inputMethod.commit();

        const payload = {
            target: typeof PulsarWindowLabel !== "undefined" ? PulsarWindowLabel : "main",
            path: node.path,
            id: node.id,
            event: event,
            value: value
        };

        if (view.building > 0 || view.heldEvents.length > 0) {
            view.heldEvents.push(payload);
            heldEventsTimer.restart();
            return;
        }

        PulsarBridge.emit("ui-event", payload);
    }

    function emitNodeEvent(node, event, value) {
        if (!hasEvent(node, event))
            return;
        emitEvent(node, event, value);
    }

    function makeFlingCurve() {
        const curve = [];

        for (let i = 0; i < 100; i++) {
            const target = i / 100;

            let low = 0;
            let high = 1;
            let x = 0.5;

            for (let step = 0; step < 40; step++) {
                x = low + (high - low) / 2;

                const reached = 3 * x * (1 - x) * ((1 - x) * 0.175 + x * 0.35) + x * x * x;

                if (Math.abs(reached - target) < 0.00001)
                    break;

                if (reached > target)
                    high = x;
                else
                    low = x;
            }

            curve.push(3 * x * (1 - x) * ((1 - x) * 0.5 + x) + x * x * x);
        }

        curve.push(1);

        return curve;
    }

    function make(code, parent) {
        let component = view.madeComponents[code];

        if (!component) {
            const parts = code.match(/^((?:import [^;]+; *)*)(.*)$/);

            component = Qt.createQmlObject(
                        "import QtQml; " + parts[1] + "QtObject { property Component made: Component { " + parts[2] + " } }",
                        view,
                        "pulsar-ui").made;
            view.madeComponents[code] = component;
        }

        return component.createObject(parent);
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

    function paddingEdges(props, fallback) {
        const all = prop(props, "padding", fallback);
        const x = prop(props, "paddingX", all);
        const y = prop(props, "paddingY", all);

        return {
            top: prop(props, "paddingTop", y),
            right: prop(props, "paddingRight", x),
            bottom: prop(props, "paddingBottom", y),
            left: prop(props, "paddingLeft", x)
        };
    }

    function applyContentPadding(inner, edges) {
        inner.anchors.topMargin = edges.top;
        inner.anchors.rightMargin = edges.right;
        inner.anchors.bottomMargin = edges.bottom;
        inner.anchors.leftMargin = edges.left;
    }

    function applyCrossAlign(layout, alignItems, horizontal) {
        if (alignItems === undefined)
            return;

        const alignment = horizontal
                ? (alignItems === "start" ? Qt.AlignTop : alignItems === "end" ? Qt.AlignBottom : Qt.AlignVCenter)
                : (alignItems === "start" ? Qt.AlignLeft : alignItems === "end" ? Qt.AlignRight : Qt.AlignHCenter);

        for (let i = 0; i < layout.children.length; i++) {
            const kid = layout.children[i];
            const kidNode = kid.pulsarMeta ? kid.pulsarMeta.node : null;

            if (!kidNode)
                continue;

            if (alignItems === "stretch") {
                if (horizontal)
                    kid.Layout.fillHeight = true;
                else
                    kid.Layout.fillWidth = true;

                continue;
            }

            if (kidNode.props.align === undefined)
                kid.Layout.alignment = alignment;
        }
    }

    function applyAbsolute(child, parent, absolute) {
        child.anchors.fill = undefined;
        child.anchors.centerIn = undefined;
        child.anchors.top = absolute.top !== undefined ? parent.top : undefined;
        child.anchors.right = absolute.right !== undefined ? parent.right : undefined;
        child.anchors.bottom = absolute.bottom !== undefined ? parent.bottom : undefined;
        child.anchors.left = absolute.left !== undefined ? parent.left : undefined;
        child.anchors.topMargin = prop(absolute, "top", 0);
        child.anchors.rightMargin = prop(absolute, "right", 0);
        child.anchors.bottomMargin = prop(absolute, "bottom", 0);
        child.anchors.leftMargin = prop(absolute, "left", 0);
    }

    function layoutMainSize(kid, horizontal) {
        const preferred = horizontal ? kid.Layout.preferredWidth : kid.Layout.preferredHeight;

        if (preferred >= 0)
            return preferred;

        return horizontal ? kid.implicitWidth : kid.implicitHeight;
    }

    function bindFlexSize(kid, layout, kids, total, flex, horizontal, edges) {
        kid.pulsarMeta.extra.flexHorizontal = horizontal;

        const size = Qt.binding(function () {
            let used = (horizontal ? edges.left + edges.right : edges.top + edges.bottom);
            let shown = 0;

            for (const other of kids) {
                if (!other.visible)
                    continue;

                shown++;

                if (!other.pulsarMeta.extra.flexed)
                    used += layoutMainSize(other, horizontal);
            }

            const gap = layout.pulsarMeta.extra.gap !== undefined ? layout.pulsarMeta.extra.gap : layout.spacing;

            used += Math.max(0, shown - 1) * gap;

            const available = horizontal ? layout.width : layout.height;

            return Math.max(0, (available - used) * flex / total);
        });

        if (horizontal) {
            kid.Layout.preferredWidth = 0;
            kid.Layout.fillWidth = true;
            kid.Layout.maximumWidth = size;
        } else {
            kid.Layout.preferredHeight = 0;
            kid.Layout.fillHeight = true;
            kid.Layout.maximumHeight = size;
        }
    }

    function applyFlex(layout, horizontal, edges) {
        const kids = [];

        let total = 0;

        for (let i = 0; i < layout.children.length; i++) {
            const kid = layout.children[i];
            const kidNode = kid.pulsarMeta ? kid.pulsarMeta.node : null;

            if (!kidNode || kid.pulsarMeta.extra.discarded)
                continue;

            kids.push(kid);

            const flex = kidNode.props.flex;

            kid.pulsarMeta.extra.flexed = flex !== undefined && flex > 0;

            if (kid.pulsarMeta.extra.flexed)
                total += flex;
        }

        if (total <= 0)
            return;

        if (horizontal)
            layout.Layout.maximumWidth = Number.POSITIVE_INFINITY;
        else
            layout.Layout.maximumHeight = Number.POSITIVE_INFINITY;

        for (const kid of kids) {
            if (kid.pulsarMeta.extra.flexed)
                bindFlexSize(kid, layout, kids, total, kid.pulsarMeta.node.props.flex, horizontal, edges);
        }
    }

    function hasFillingChild(layout, horizontal) {
        for (let i = 0; i < layout.children.length; i++) {
            const kid = layout.children[i];
            const kidNode = kid.pulsarMeta ? kid.pulsarMeta.node : null;

            if (!kidNode || kidNode.props.visible === false || kid.pulsarMeta.extra.discarded)
                continue;

            if (horizontal ? kid.Layout.fillWidth : kid.Layout.fillHeight)
                return true;
        }

        return false;
    }

    function ensureFiller(layout, horizontal) {
        const extra = layout.pulsarMeta.extra;

        if (!extra.filler) {
            extra.filler = make("import QtQuick; Item {}", layout);
            extra.filler.Layout.preferredWidth = 0;
            extra.filler.Layout.preferredHeight = 0;
            extra.filler.Layout.fillWidth = horizontal;
            extra.filler.Layout.fillHeight = !horizontal;
        }

        extra.filler.visible = true;

        if (PulsarBridge.env("PULSAR_DEBUG") && layout.pulsarMeta.node)
            console.log("PulsarView packed " + layout.pulsarMeta.node.path);

        let last = null;

        for (let i = 0; i < layout.children.length; i++) {
            if (layout.children[i].pulsarMeta || layout.children[i] === extra.filler)
                last = layout.children[i];
        }

        if (last === extra.filler)
            return;

        extra.filler.parent = null;
        extra.filler.parent = layout;
    }

    function refreshPacking(layout, horizontal) {
        const extra = layout.pulsarMeta.extra;

        if (extra.packing || extra.nativeContent)
            return;

        extra.packing = true;

        const shown = extra.filler && extra.filler.visible;
        const size = horizontal ? layout.width : layout.height;
        const implicit = horizontal ? layout.implicitWidth : layout.implicitHeight;
        const content = implicit - (shown ? layout.spacing : 0);
        const spare = size - content > layout.spacing + 0.5;

        if (spare && !hasFillingChild(layout, horizontal))
            ensureFiller(layout, horizontal);
        else if (extra.filler)
            extra.filler.visible = false;

        extra.packing = false;
    }

    function packMainAxis(layout, horizontal) {
        const extra = layout.pulsarMeta.extra;

        refreshPacking(layout, horizontal);

        if (extra.packWatched)
            return;

        extra.packWatched = true;

        const refresh = function () {
            refreshPacking(layout, horizontal);
        };

        if (horizontal) {
            layout.widthChanged.connect(refresh);
            layout.implicitWidthChanged.connect(refresh);
            return;
        }

        layout.heightChanged.connect(refresh);
        layout.implicitHeightChanged.connect(refresh);
    }

    function syncFieldText(item, value) {
        const extra = item.pulsarMeta.extra;
        const typed = extra.typedTexts || [];
        const echo = typed.lastIndexOf(value);
        const changed = value !== extra.lastValue;

        extra.lastValue = value;

        if (echo >= 0)
            extra.typedTexts = typed.slice(echo + 1);

        if (item.activeFocus && (echo >= 0 || !changed))
            return;

        if (item.text === value)
            return;

        item.pulsarMeta.syncing = true;
        item.text = value;
        item.pulsarMeta.syncing = false;
    }

    function scheduleGaps(layout) {
        const meta = layout ? layout.pulsarMeta : null;

        if (!meta || meta.type !== "column")
            return;

        if (view.gapLayouts.indexOf(layout) < 0)
            view.gapLayouts.push(layout);

        Qt.callLater(view.flushGaps);
    }

    function flushGaps() {
        const layouts = view.gapLayouts;

        view.gapLayouts = [];

        for (const layout of layouts)
            applyGaps(layout);
    }

    function openShare(kid) {
        const motion = kid.pulsarMeta.extra.motion;

        if (!motion || motion.fullHeight <= 0 || motion.heightLimit >= motion.fullHeight)
            return 1;

        return Math.max(0, motion.heightLimit / motion.fullHeight);
    }

    function applyGaps(layout) {
        const gap = layout.pulsarMeta.extra.gap || 0;

        let opened = 0;

        for (let i = 0; i < layout.children.length; i++) {
            const kid = layout.children[i];
            const meta = kid.pulsarMeta;

            if (!meta || !meta.node)
                continue;

            const animating = meta.extra.motion && meta.extra.motion.animating;

            if ((meta.extra.discarded || meta.node.props.visible === false) && !animating)
                continue;

            const share = openShare(kid);

            kid.Layout.topMargin = (meta.extra.baseTopMargin || 0) + gap * share * Math.min(1, opened);
            opened += share;
        }
    }

    function applyLayoutLimits(item, props) {
        const extra = item.pulsarMeta.extra;
        const motion = extra.motion;

        if (props.minWidth !== undefined)
            item.Layout.minimumWidth = props.minWidth;
        if (props.minHeight !== undefined)
            item.Layout.minimumHeight = props.minHeight;

        extra.maxHeight = props.maxHeight !== undefined ? props.maxHeight : Number.POSITIVE_INFINITY;
        if (!extra.flexed || extra.flexHorizontal !== false)
            item.Layout.maximumHeight = Math.min(extra.maxHeight, motion ? motion.heightLimit : Number.POSITIVE_INFINITY);

        if (props.zIndex !== undefined)
            item.z = props.zIndex;

        if (extra.baseClip === undefined)
            extra.baseClip = item.clip;

        extra.clip = props.clip !== undefined ? props.clip === true : extra.baseClip;

        if (!motion || !motion.animating)
            item.clip = extra.clip;
    }

    function applyPadding(layout, padding, horizontal) {
        const kids = layout.children;
        const active = [];

        const filler = layout.pulsarMeta.extra.filler;

        for (let i = 0; i < kids.length; i++) {
            const meta = kids[i].pulsarMeta;

            if (meta && meta.node && !meta.extra.discarded && meta.node.props.visible !== false)
                active.push(i);
        }

        const first = active.length > 0 ? active[0] : -1;
        const last = active.length > 0 ? active[active.length - 1] : -1;

        for (let i = 0; i < kids.length; i++) {
            const kid = kids[i];

            if (kid === filler || !kid.pulsarMeta)
                continue;

            if (horizontal) {
                kid.Layout.topMargin = padding.top;
                kid.Layout.bottomMargin = padding.bottom;
                kid.Layout.leftMargin = i === first ? padding.left : 0;
                kid.Layout.rightMargin = i === last ? padding.right : 0;
                continue;
            }

            kid.Layout.leftMargin = padding.left;
            kid.Layout.rightMargin = padding.right;
            kid.pulsarMeta.extra.baseTopMargin = i === first ? padding.top : 0;
            kid.Layout.topMargin = kid.pulsarMeta.extra.baseTopMargin;
            kid.Layout.bottomMargin = i === last ? padding.bottom : 0;
        }

        if (!horizontal && layout.pulsarMeta.type === "column")
            applyGaps(layout);
    }

    function discardItem(item) {
        if (!item)
            return;

        const node = item.pulsarMeta ? item.pulsarMeta.node : null;

        if (item.pulsarMeta)
            item.pulsarMeta.extra.discarded = true;

        if (node) {
            view.uiStats.removed++;

            const prefix = node.path + "/";

            for (const path in view.nodeItems) {
                if (path === node.path || path.indexOf(prefix) === 0)
                    delete view.nodeItems[path];
            }
        }

        const motion = item.pulsarMeta ? item.pulsarMeta.extra.motion : null;
        const exit = node ? node.props.exit : undefined;

        if (motion && exit && view.motionReady && item.visible) {
            item.enabled = false;
            motion.playExit(exit, function () {
                logMotion("exit done", node.path);
                item.visible = false;
                item.destroy();
            });

            return;
        }

        // destroy() defers deletion to the next event loop pass. Hide the old
        // node right away so it neither renders over the replacement nor
        // counts as a layout child when padding is recomputed.
        item.visible = false;
        item.destroy();
    }

    function logMotion(label, path) {
        if (PulsarBridge.env("PULSAR_DEBUG"))
            console.log("PulsarView " + label + " " + path);
    }

    function applyMotion(item, node) {
        const props = node.props;
        const extra = item.pulsarMeta.extra;

        if (!extra.motion && !props.pressed && !props.hover && !props.disabled
                && !props.enter && !props.exit && !props.drag)
            return;

        if (!extra.motion) {
            extra.motion = motionComponent.createObject(item);
            item.transform = [extra.motion.shift, extra.motion.zoom];
        }

        extra.motion.configure(props);
        applyDrag(item, extra.motion, props.drag);
    }

    function applyDrag(item, motion, drag) {
        const extra = item.pulsarMeta.extra;

        if (!drag) {
            if (extra.drag)
                extra.drag.enabled = false;

            return;
        }

        if (!extra.drag)
            extra.drag = dragComponent.createObject(item, { motion: motion });

        extra.drag.enabled = true;
        extra.drag.axis = drag.axis;
        extra.drag.threshold = drag.threshold !== undefined ? drag.threshold : 96;
    }

    function applyVisible(item, props) {
        if (props.visible === undefined)
            return;

        const extra = item.pulsarMeta.extra;
        const motion = extra.motion;
        const previous = extra.lastVisible;
        const next = props.visible;

        extra.lastVisible = next;

        if (previous !== next)
            scheduleGaps(item.parent);

        if (!motion || !view.motionReady || previous === undefined || previous === next) {
            item.visible = next;
            return;
        }

        if (next && !props.enter) {
            motion.settle();
            item.visible = true;
            return;
        }

        if (next) {
            item.visible = true;
            motion.playEnter(props.enter);
            logMotion("enter", item.pulsarMeta.node.path);
            return;
        }

        if (!props.exit) {
            item.visible = false;
            return;
        }

        motion.playExit(props.exit, function () {
            item.visible = false;
            motion.settle();
            logMotion("hide done", item.pulsarMeta.node.path);
        });
    }

    // The view moved to the end of content that got shorter than the position kept for it.
    function isScrollClamp(item) {
        const saved = view.scrollPositions[item.pulsarMeta.extra.scrollKey];
        const maxY = Math.max(0, item.contentHeight - item.height);

        return saved !== undefined && saved > maxY + 1 && Math.abs(item.contentY - maxY) < 1;
    }

    // Just after the screen is shown its content is laid out again; moves before it has the old height are not the user's.
    function isScrollSettling(item) {
        const extra = item.pulsarMeta.extra;

        return extra.pendingScroll !== undefined && Date.now() < (extra.settleUntil || 0)
                && Math.abs(item.contentY - extra.pendingScroll) > 1 && !item.moving && !item.dragging;
    }

    function logScroll(label, item) {
        if (!view.debugging)
            return;

        const extra = item.pulsarMeta.extra;

        console.log("PulsarView scroll " + label + " " + extra.scrollKey + " saved=" + Math.round(view.scrollPositions[extra.scrollKey] || 0)
                    + " y=" + Math.round(item.contentY) + " content=" + Math.round(item.contentHeight));
    }

    function applyPendingScroll(list) {
        const extra = list.pulsarMeta.extra;
        const pending = extra.pendingScroll;

        if (pending === undefined)
            return;

        extra.restoringScroll = true;
        list.contentY = Math.min(pending, Math.max(0, list.contentHeight - list.height));
        extra.restoringScroll = false;

        view.logScroll("restored", list);
    }

    function setupScrollMemory(item, node) {
        const extra = item.pulsarMeta.extra;

        extra.scrollKey = node.path;
        extra.pendingScroll = view.scrollPositions[node.path];

        item.contentYChanged.connect(function () {
            if (extra.restoringScroll)
                return;

            // A hidden screen collapses its content and the view clamps to the top; that is not the user's scroll.
            if (!item.visible)
                return;

            // The same clamp can land after the screen is shown again, while its content is still being laid out.
            if (view.isScrollClamp(item) || view.isScrollSettling(item))
                return;

            extra.pendingScroll = undefined;
            view.scrollPositions[extra.scrollKey] = item.contentY;
        });

        item.visibleChanged.connect(function () {
            if (!item.visible) {
                view.logScroll("hidden", item);

                return;
            }

            extra.pendingScroll = view.scrollPositions[extra.scrollKey];
            extra.settleUntil = Date.now() + 1500;
            view.logScroll("shown", item);
            view.applyPendingScroll(item);
        });

        item.heightChanged.connect(function () {
            view.syncKeyboardInset(item);

            if (view.revealTarget && view.keyboardTop() < Infinity) {
                view.revealTicks = 2;
                keyboardRevealTimer.restart();
            }
        });

        item.contentHeightChanged.connect(function () {
            if (extra.pendingScroll !== undefined)
                view.applyPendingScroll(item);
        });

        Qt.callLater(function () {
            view.applyPendingScroll(item);
        });
    }

    function nodePathFor(item) {
        let current = item;

        while (current && current !== view) {
            if (current.pulsarMeta && current.pulsarMeta.node)
                return current.pulsarMeta.node.path;

            current = current.parent;
        }

        return null;
    }

    function captureFocus() {
        const item = view.activeFocusItem;

        if (!item)
            return null;

        const path = nodePathFor(item);

        if (path === null)
            return null;

        const state = { path: path };

        if (item.cursorPosition !== undefined)
            state.cursorPosition = item.cursorPosition;
        if (item.selectionStart !== undefined)
            state.selectionStart = item.selectionStart;
        if (item.selectionEnd !== undefined)
            state.selectionEnd = item.selectionEnd;

        return state;
    }

    function restoreFocus(state) {
        if (!state)
            return;

        const item = view.nodeItems[state.path];

        if (!item)
            return;
        if (view.activeFocusItem && view.activeFocusItem !== item)
            return;

        item.forceActiveFocus();

        if (state.cursorPosition !== undefined && item.cursorPosition !== undefined)
            item.cursorPosition = state.cursorPosition;
        if (item.select && state.selectionEnd > state.selectionStart)
            item.select(state.selectionStart, state.selectionEnd);
    }

    function captureScrolls(items) {
        const out = [];

        for (const item of items) {
            if (!item || item.contentY === undefined || item.contentHeight === undefined)
                continue;

            out.push({ item: item, y: item.contentY });
        }

        return out;
    }

    function restoreScrolls(scrolls) {
        for (const entry of scrolls) {
            const item = entry.item;

            if (!item || item.contentY === undefined)
                continue;

            item.contentY = Math.min(entry.y, Math.max(0, item.contentHeight - item.height));
        }
    }

    // Stops every media player (MediaPlayer, Video) below an item loaded from the app's QML.
    function releaseMedia(object, depth) {
        if (!object || (depth || 0) > 40)
            return;

        if (object.playbackState !== undefined && typeof object.stop === "function") {
            object.stop();

            if (object.source !== undefined)
                object.source = "";
        }

        if (object.item !== undefined && object.item !== null)
            releaseMedia(object.item, (depth || 0) + 1);

        const parts = object.data;

        if (!parts)
            return;

        for (let i = 0; i < parts.length; i++)
            releaseMedia(parts[i], (depth || 0) + 1);
    }

    // Video needs QtMultimedia, so its file is loaded on first use and a missing module costs only the video.
    function createVideo(parent) {
        if (!view.videoComponent)
            view.videoComponent = Qt.createComponent("qrc:/runtime/video/VideoNode.qml");

        const component = view.videoComponent;

        if (component.status !== Component.Ready) {
            console.warn("Video is not available in this build: " + component.errorString());

            return itemComponent.createObject(parent);
        }

        return component.createObject(parent, { view: viewRef });
    }

    function applyQmlProps(loader, node) {
        if (!loader || !node)
            return;

        const custom = prop(node.props, "props", {});
        const loaded = loader.item;

        loader.pulsarPath = node.path;

        const emit = function (name, value) {
            emitEvent(loader.pulsarMeta.node, "event", { name: name, value: value });
        };

        loader.pulsarEmit = emit;

        if (!loaded)
            return;

        // The property is optional: an item that never emits does not declare it.
        if ("pulsarEmit" in loaded)
            loaded.pulsarEmit = emit;

        if (loader.pulsarMeta.extra.qmlSized !== loaded) {
            loader.pulsarMeta.extra.qmlSized = loaded;

            if (loaded.width !== undefined) {
                loaded.width = Qt.binding(function () {
                    return loader.width;
                });
            }

            if (loaded.height !== undefined) {
                loaded.height = Qt.binding(function () {
                    return loader.height;
                });
            }
        }

        for (const key in custom)
            loaded[key] = custom[key];
    }

    function applyOrder(parent, items) {
        const direct = [];

        for (const item of items) {
            if (item && item.parent === parent)
                direct.push(item);
        }

        let previous = -1;
        let ordered = true;

        for (const item of direct) {
            const index = parent.children.indexOf(item);

            if (index < previous) {
                ordered = false;
                break;
            }

            previous = index;
        }

        if (ordered)
            return;

        view.uiStats.reordered += direct.length;

        const scrolls = captureScrolls(direct);
        const focused = view.activeFocusItem;

        view.reordering = true;

        for (const item of direct) {
            item.parent = null;
            item.parent = parent;
        }

        restoreScrolls(scrolls);

        if (focused && !focused.activeFocus)
            focused.forceActiveFocus();

        view.reordering = false;

        if (view.revealTarget) {
            view.revealTicks = 2;
            keyboardRevealTimer.restart();
        }

        if (PulsarBridge.env("PULSAR_DEBUG"))
            console.log("PulsarView reorder " + parent.pulsarMeta.type + " " + direct.length);
    }

    function reconcile(parent, nodes, isRoot) {
        if (view.patchShallow)
            return;

        const meta = parent.pulsarMeta;

        if (!meta)
            return;

        const index = meta.index;
        const paths = [];
        const wanted = ({});
        const desired = [];

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];

            paths.push(node.path);
            wanted[node.path] = true;
        }

        for (const path in index) {
            if (wanted[path] === true)
                continue;

            discardItem(index[path]);
            delete index[path];
        }

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            let item = index[node.path];

            if (item && item.pulsarMeta.type === node.type) {
                view.uiStats.updated++;
                updateNode(item, node, isRoot);
                desired.push(item);
                continue;
            }

            if (item) {
                discardItem(item);
                delete index[node.path];
            }

            item = createNode(node, parent, isRoot);
            index[node.path] = item;
            desired.push(item);
        }

        meta.order = paths;
        applyOrder(parent, desired);
    }

    function isVector(value) {
        return typeof value === "object" && value !== null && value.length !== undefined;
    }

    function shaderProperty(name, value) {
        const type = typeof value === "number" ? "real"
                : !isVector(value) ? "color"
                : value.length === 2 ? "vector2d"
                : value.length === 3 ? "vector3d"
                : "vector4d";

        return "property " + type + " " + name + "; ";
    }

    function shaderUrl(source) {
        const base = PulsarBridge.env("PULSAR_APP") || "";

        return /^[a-z][a-z0-9+.-]*:/i.test(source) ? source + ".qsb"
                : "file://" + (source.charAt(0) === "/" ? source : base + "/" + source) + ".qsb";
    }

    function makeShader(node, parent) {
        const uniforms = prop(node.props, "uniforms", {});
        const url = shaderUrl(prop(node.props, "source", ""));

        let declared = "";

        for (const name of Object.keys(uniforms).sort())
            declared += shaderProperty(name, uniforms[name]);

        return make("import QtQuick; ShaderEffect { id: root; fragmentShader: " + JSON.stringify(url) + "; property var pulsarMeta: null; "
                + "property bool animated: true; property real pulsar_time: 0; "
                + "property vector2d pulsar_resolution: Qt.vector2d(width, height); " + declared
                + "FrameAnimation { running: root.animated && root.visible; "
                + "onTriggered: root.pulsar_time += frameTime } }", parent);
    }

    function shaderUniform(value) {
        if (typeof value === "number")
            return value;
        if (value === "primary")
            return view.themePrimary;
        if (!isVector(value))
            return resolveColor(value, "transparent");
        if (value.length === 2)
            return Qt.vector2d(value[0], value[1]);
        if (value.length === 3)
            return Qt.vector3d(value[0], value[1], value[2]);

        return Qt.vector4d(value[0], value[1], value[2], value[3]);
    }

    function applyShader(item, props) {
        const url = shaderUrl(prop(props, "source", ""));

        if (item.fragmentShader.toString() !== url)
            item.fragmentShader = url;

        item.animated = prop(props, "animated", true);

        const uniforms = prop(props, "uniforms", {});

        for (const name of Object.keys(uniforms)) {
            if (item[name] === undefined) {
                console.error("[pulsar] Shader uniform " + name + " was added after the shader was created; give the node a new key");
                continue;
            }

            item[name] = shaderUniform(uniforms[name]);
        }

        if (PulsarBridge.env("PULSAR_DEBUG") && item.pulsarMeta && item.pulsarMeta.extra.shaderWatched !== true) {
            item.pulsarMeta.extra.shaderWatched = true;
            item.statusChanged.connect(function () {
                console.log("PulsarView shader status " + item.status + " " + item.log);
            });
        }
    }

    function applySpin(item, speed) {
        const extra = item.pulsarMeta.extra;

        if (!speed && !extra.spinner)
            return;

        if (!extra.spinner) {
            extra.spinner = make("import QtQuick; RotationAnimator { from: 0; to: 360; loops: Animation.Infinite }", item);
            extra.spinner.target = item;
        }

        extra.spinner.running = false;

        if (!speed)
            return;

        extra.spinner.duration = 60000 / Math.abs(speed);
        extra.spinner.to = speed > 0 ? 360 : -360;
        extra.spinner.running = true;
    }

    function blurEffect(radius) {
        const code = "blur:" + radius;

        if (!view.madeComponents[code]) {
            view.madeComponents[code] = Qt.createQmlObject(
                        "import QtQuick; import QtQuick.Effects; QtObject { property Component made: Component { "
                        + "MultiEffect { blurEnabled: true; blur: 1; blurMax: " + Math.round(radius)
                        + "; autoPaddingEnabled: false } } }", view, "pulsar-ui").made;
        }

        return view.madeComponents[code];
    }

    function applyBlur(item, radius) {
        const extra = item.pulsarMeta.extra;

        if (!radius && !extra.blurred)
            return;

        if (!view.effectsAvailable)
            return;

        extra.blurred = radius > 0;
        item.layer.enabled = radius > 0;
        item.layer.effect = radius > 0 ? blurEffect(radius) : null;
    }

    function glassStack(item) {
        for (let parent = item.parent; parent; parent = parent.parent) {
            if (parent.pulsarMeta && parent.pulsarMeta.type === "stack")
                return parent;
        }

        return null;
    }

    function glassBackdrop(stack, radius) {
        const extra = stack.pulsarMeta.extra;

        if (extra.glassBackdrop)
            return extra.glassBackdrop;

        let background = null;

        for (let i = 0; i < stack.children.length && !background; i++) {
            if (stack.children[i].pulsarMeta && stack.children[i].pulsarMeta.node)
                background = stack.children[i];
        }

        if (!background)
            return null;

        const effect = make("import QtQuick; import QtQuick.Effects; MultiEffect { blurEnabled: true; blur: 1; "
                + "blurMax: " + Math.round(radius) + "; autoPaddingEnabled: false; visible: false; layer.enabled: true }", stack);

        effect.source = background;
        background.layer.enabled = true;
        effect.width = Qt.binding(function () { return stack.width; });
        effect.height = Qt.binding(function () { return stack.height; });
        extra.glassBackdrop = effect;
        extra.glassPanes = [];

        const ticker = make("import QtQuick; FrameAnimation { running: true }", stack);

        ticker.triggered.connect(function () {
            if (!stack.visible)
                return;

            for (const pane of extra.glassPanes) {
                if (pane.visible)
                    pane.sync();
            }
        });

        return effect;
    }

    function applyGlass(item, glass, radius) {
        const extra = item.pulsarMeta.extra;

        if (!glass || extra.glassPane || !view.effectsAvailable)
            return;

        const stack = glassStack(item);

        Qt.callLater(function () {
            const backdrop = stack ? glassBackdrop(stack, prop(glass, "blur", 32)) : null;

            if (!backdrop || !item.pulsarMeta)
                return;

            const pane = make("import QtQuick; ShaderEffect { id: pane; z: -1; anchors.fill: parent; "
                    + "property var backdrop; property vector4d area; property vector2d size: Qt.vector2d(width, height); "
                    + "property real cornerRadius: 0; property color tint; property color base; property var stack; "
                    + "fragmentShader: 'qrc:/runtime/shaders/glass.raw.frag.qsb'; "
                    + "function sync() { const a = mapToItem(stack, 0, 0); const b = mapToItem(stack, width, height); "
                    + "area = Qt.vector4d(a.x / stack.width, a.y / stack.height, (b.x - a.x) / stack.width, (b.y - a.y) / stack.height) } }", item);

            pane.stack = stack;
            pane.backdrop = backdrop;
            pane.cornerRadius = radius;
            pane.tint = resolveColor(prop(glass, "tint", "#14ffffff"), "#14ffffff");
            pane.base = view.themeBackground;
            pane.sync();
            stack.pulsarMeta.extra.glassPanes.push(pane);
            extra.glassPane = pane;
        });
    }

    function createNode(node, parent, isRoot) {
        let item = null;

        if (node.type === "column") {
            item = columnComponent.createObject(parent);
        } else if (node.type === "row") {
            item = rowComponent.createObject(parent);
        } else if (node.type === "canvas") {
            item = canvasComponent.createObject(parent);
        } else if (node.type === "shader") {
            item = makeShader(node, parent);
        } else if (node.type === "arrange") {
            item = arrangeComponent.createObject(parent);
        } else if (node.type === "wrap" || node.type === "stack") {
            item = itemComponent.createObject(parent);
        } else if (node.type === "box") {
            item = boxComponent.createObject(parent);
        } else if (node.type === "scroll" || node.type === "list") {
            item = flickableComponent.createObject(parent);
        } else if (node.type === "grid") {
            item = gridComponent.createObject(parent);
        } else if (node.type === "virtualRows") {
            item = virtualRowsComponent.createObject(parent);
        } else if (node.type === "virtualList") {
            item = virtualListComponent.createObject(parent);
        } else if (node.type === "card") {
            item = cardComponent.createObject(parent);
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
        } else if (node.type === "navRail") {
            item = navRailComponent.createObject(parent);
        } else if (node.type === "snackbar") {
            item = snackbarComponent.createObject(overlay);
        } else if (node.type === "popover") {
            item = popoverComponent.createObject(overlay);
        } else if (node.type === "menu") {
            item = menuComponent.createObject(overlay);
        } else if (node.type === "fab") {
            const fabPlacement = prop(node.props, "placement", "bottom-end");

            item = fabComponent.createObject(fabPlacement === "inline" ? parent : overlay);
        } else if (node.type === "radio") {
            item = radioComponent.createObject(parent);
        } else if (node.type === "radioGroup") {
            item = radioGroupComponent.createObject(parent);
        } else if (node.type === "accordion") {
            item = accordionComponent.createObject(parent);
        } else if (node.type === "accordionSection") {
            item = accordionSectionComponent.createObject(parent);
        } else if (node.type === "searchField") {
            item = searchFieldComponent.createObject(parent);
        } else if (node.type === "rangeSlider") {
            item = rangeSliderComponent.createObject(parent);
        } else if (node.type === "neon") {
            item = neonComponent.createObject(parent);
        } else if (node.type === "navBar") {
            item = navBarComponent.createObject(parent);
        } else if (node.type === "zoomable") {
            item = zoomableComponent.createObject(parent);
        } else if (node.type === "video") {
            item = createVideo(parent);
        } else if (node.type === "qml") {
            item = qmlComponent.createObject(parent);
        } else if (node.type === "text") {
            item = labelComponent.createObject(parent);
        } else if (node.type === "selectableText") {
            item = selectableTextComponent.createObject(parent);
        } else if (node.type === "button") {
            item = buttonComponent.createObject(parent);
        } else if (node.type === "icon") {
            item = textComponent.createObject(parent);
        } else if (node.type === "iconButton") {
            item = toolButtonComponent.createObject(parent);
        } else if (node.type === "textInput") {
            item = textFieldComponent.createObject(parent);
        } else if (node.type === "textArea") {
            item = textAreaComponent.createObject(parent);
        } else if (node.type === "checkbox") {
            item = checkboxComponent.createObject(parent);
        } else if (node.type === "switch") {
            item = switchComponent.createObject(parent);
        } else if (node.type === "slider") {
            item = sliderComponent.createObject(parent);
        } else if (node.type === "select") {
            item = comboBoxComponent.createObject(parent);
        } else if (node.type === "progress") {
            item = progressBarComponent.createObject(parent);
        } else if (node.type === "image") {
            item = imageComponent.createObject(parent);
        } else if (node.type === "avatar") {
            item = avatarComponent.createObject(parent);
        } else if (node.type === "badge") {
            item = badgeComponent.createObject(parent);
        } else if (node.type === "skeleton") {
            item = skeletonComponent.createObject(parent);
        } else if (node.type === "spinner") {
            item = spinnerComponent.createObject(parent);
        } else if (node.type === "spacer") {
            item = itemComponent.createObject(parent);
        } else if (node.type === "divider") {
            item = rectangleComponent.createObject(parent);
        } else {
            item = rectangleComponent.createObject(parent);
        }

        item.pulsarMeta = {
            type: node.type,
            node: node,
            index: ({}),
            order: [],
            content: null,
            extra: ({})
        };

        view.nodeItems[node.path] = item;
        view.uiStats.created++;

        if (prop(node.props, "animate", 0) > 0) {
            item.opacity = 0;
            item.pulsarMeta.extra.animateFrom = 0;
        }

        if (node.type === "scroll" || node.type === "list")
            setupScrollMemory(item, node);

        prepareItem(item, node);

        const nested = view.creatingNodes > 0;

        view.creatingNodes++;

        try {
            updateNode(item, node, isRoot);
        } finally {
            view.creatingNodes--;
        }

        if (!nested && view.motionReady && node.props.enter && item.visible) {
            item.pulsarMeta.extra.motion.playEnter(node.props.enter);
            logMotion("enter", node.path);
        }

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
            if (node.type === "textArea") {
                item.cursorRectangleChanged.connect(function () {
                    if (item.activeFocus)
                        view.revealCursor(item);
                });
            }
            item.textChanged.connect(function () {
                if (item.pulsarMeta.syncing === true)
                    return;

                const extra = item.pulsarMeta.extra;

                extra.typedTexts = (extra.typedTexts || []).concat(item.text).slice(-64);

                if (hasEvent(item.pulsarMeta.node, "input"))
                    emitEvent(item.pulsarMeta.node, "input", item.text);
            });
            item.activeFocusChanged.connect(function () {
                if (item.activeFocus) {
                    view.revealTarget = item;
                    view.revealTicks = 4;
                    keyboardRevealTimer.restart();
                } else if (view.revealTarget === item) {
                    view.revealTarget = null;
                }
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
            item.toggled.connect(function () {
                if (item.pulsarMeta.syncing === true)
                    return;
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
        } else if (node.type === "radio") {
            item.toggled.connect(function (value) {
                if (item.pulsarMeta.syncing === true)
                    return;
                if (value && hasEvent(item.pulsarMeta.node, "select"))
                    emitEvent(item.pulsarMeta.node, "select", true);
            });
        } else if (node.type === "searchField") {
            item.displayTextChanged.connect(function () {
                if (item.pulsarMeta.syncing === true)
                    return;

                const extra = item.pulsarMeta.extra;

                extra.typedTexts = (extra.typedTexts || []).concat(item.displayText).slice(-64);

                if (item.debounce > 0) {
                    item.inputTimer.restart();
                    return;
                }
                if (hasEvent(item.pulsarMeta.node, "input"))
                    emitEvent(item.pulsarMeta.node, "input", item.displayText);
            });
            item.accepted.connect(function () {
                if (hasEvent(item.pulsarMeta.node, "submit"))
                    emitEvent(item.pulsarMeta.node, "submit", item.text);
            });
            item.activeFocusChanged.connect(function () {
                if (item.activeFocus) {
                    view.revealTarget = item;
                    keyboardRevealTimer.restart();
                } else if (view.revealTarget === item) {
                    view.revealTarget = null;
                }
            });
        } else if (node.type === "rangeSlider") {
            const emitRange = function () {
                if (item.pulsarMeta.syncing === true)
                    return;
                if (hasEvent(item.pulsarMeta.node, "change"))
                    emitEvent(item.pulsarMeta.node, "change", { from: item.first.value, to: item.second.value });
            };

            item.first.moved.connect(emitRange);
            item.second.moved.connect(emitRange);
        }

        const clickableSurface = node.type === "box" || node.type === "card" || node.type === "image";

        if (hasEvent(node, "longPress") || (clickableSurface && hasEvent(node, "click"))) {
            const press = make("import QtQuick; TapHandler { longPressThreshold: 0.5 }", item);

            press.tapped.connect(function () {
                if (!clickableSurface || !hasEvent(item.pulsarMeta.node, "click"))
                    return;

                view.tappedItems.push(item);
                Qt.callLater(view.flushTap);
            });

            press.longPressed.connect(function () {
                if (hasEvent(item.pulsarMeta.node, "longPress"))
                    emitEvent(item.pulsarMeta.node, "longPress");
            });

            if (clickableSurface) {
                view.trackHover(make("import QtQuick; HoverHandler { cursorShape: Qt.PointingHandCursor }", item));
            }
        }
    }

    function itemDepth(item) {
        let depth = 0;

        for (let parent = item.parent; parent; parent = parent.parent)
            depth++;

        return depth;
    }

    function flushTap() {
        const items = tappedItems;

        tappedItems = [];

        let deepest = null;

        for (const item of items) {
            if (!deepest || itemDepth(item) > itemDepth(deepest))
                deepest = item;
        }

        if (deepest && deepest.pulsarMeta)
            emitEvent(deepest.pulsarMeta.node, "click");
    }

    function animateOpacity(item, to, duration) {
        const anim = make("import QtQuick; NumberAnimation { property: 'opacity'; easing.type: Easing.OutCubic }", item);

        anim.target = item;
        anim.from = item.opacity;
        anim.to = to;
        anim.duration = duration;
        anim.finished.connect(function () {
            anim.destroy();
        });
        anim.start();
    }

    function applyBadge(item, props) {
        if (!item.pulsarMeta)
            return;

        const value = prop(props, "badge", undefined);
        let badge = item.pulsarMeta.extra.badge;

        if (value === undefined) {
            if (badge)
                badge.visible = false;

            return;
        }

        if (!badge) {
            badge = make("import QtQuick; import QtQuick.Controls; Rectangle { property alias label: badgeLabel; z: 20; Label { id: badgeLabel; anchors.centerIn: parent } }", item);
            badge.label.font.family = view.fontFamily;
            badge.label.font.pixelSize = view.fs(10);
            badge.label.font.weight = 600;
            badge.label.color = "#ffffff";
            item.pulsarMeta.extra.badge = badge;
        }

        const dot = value === "dot";

        badge.visible = true;
        badge.color = resolveColor(prop(props, "badgeColor", "red"), "#e78284");
        badge.anchors.right = item.right;
        badge.anchors.top = item.top;
        badge.anchors.rightMargin = -4;
        badge.anchors.topMargin = -4;

        if (dot) {
            badge.width = 8;
            badge.height = 8;
            badge.radius = 4;
            badge.label.visible = false;
            badge.label.text = "";
            return;
        }

        const count = Number(value);

        badge.label.visible = true;
        badge.label.text = count > 99 ? "99+" : String(count);
        badge.width = Math.max(18, badge.label.implicitWidth + 8);
        badge.height = 18;
        badge.radius = 9;
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

    function stateHasColor(node) {
        return node.type === "box" || node.type === "card";
    }

    function ensureHover(item, props) {
        const extra = item.pulsarMeta.extra;

        if (extra.hover || (props.hover === undefined && props.hoverColor === undefined))
            return;

        extra.hover = make("import QtQuick; HoverHandler {}", item);
        extra.hover.cursorShape = Qt.PointingHandCursor;
        view.trackHover(extra.hover);
        extra.hover.hoveredChanged.connect(function () {
            refreshStates(item);
        });
    }

    function activeState(item, props) {
        const extra = item.pulsarMeta.extra;

        if (props.enabled === false)
            return "disabled";
        if (extra.motion && extra.motion.holding && props.pressed)
            return "pressed";
        if (extra.hover && extra.hover.hovered && (props.hover || props.hoverColor !== undefined))
            return "hover";

        return "normal";
    }

    function refreshStates(item) {
        const meta = item.pulsarMeta;

        if (!meta || !meta.node)
            return;

        const node = meta.node;
        const props = node.props;
        const extra = meta.extra;
        const styled = props.hover || props.pressed || props.disabled || props.hoverColor !== undefined;

        if (!styled && !extra.styled)
            return;

        extra.styled = styled;

        const state = activeState(item, props);
        const style = (state !== "normal" && props[state]) || ({});
        const duration = props.transition && props.transition.duration !== undefined ? props.transition.duration : 120;

        if (extra.lastState !== state) {
            extra.lastState = state;
            logMotion("state " + state, node.path);
        }

        if (stateHasColor(node)) {
            const fallback = node.type === "card" ? view.themeSurface : "transparent";
            const base = prop(props, "color", fallback);
            const hoverColor = state === "hover" && style.color === undefined ? props.hoverColor : undefined;
            const color = style.color !== undefined ? style.color : (hoverColor !== undefined ? hoverColor : base);

            item.pulsarColorMs = duration;
            item.color = resolveColor(color, fallback);
            item.border.color = resolveColor(prop(style, "borderColor", prop(props, "borderColor", view.themeBorder)), view.themeBorder);
        }

        if (extra.motion)
            extra.motion.stateScale = prop(style, "scale", 1);

        if (extra.motion && extra.motion.animating)
            return;

        const opacity = prop(style, "opacity", prop(props, "opacity", 1));

        if (extra.stateOpacity !== undefined && extra.stateOpacity !== opacity)
            animateOpacity(item, opacity, duration);
        else
            item.opacity = opacity;

        extra.stateOpacity = opacity;
    }

    function emitLayout(item) {
        if (!item || !item.pulsarMeta)
            return;
        if (!hasEvent(item.pulsarMeta.node, "layout"))
            return;
        if (item.width < 0 || item.height < 0)
            return;

        const extra = item.pulsarMeta.extra;

        if (extra.lastLayoutWidth === item.width && extra.lastLayoutHeight === item.height
                && extra.lastLayoutX === item.x && extra.lastLayoutY === item.y)
            return;

        extra.lastLayoutWidth = item.width;
        extra.lastLayoutHeight = item.height;
        extra.lastLayoutX = item.x;
        extra.lastLayoutY = item.y;
        emitEvent(item.pulsarMeta.node, "layout", { width: item.width, height: item.height, x: item.x, y: item.y });
    }

    function scheduleLayout(item) {
        if (!item || !item.pulsarMeta)
            return;

        const extra = item.pulsarMeta.extra;

        if (extra.layoutPending === true)
            return;

        extra.layoutPending = true;
        Qt.callLater(function () {
            if (!item || !item.pulsarMeta)
                return;

            extra.layoutPending = false;
            emitLayout(item);
        });
    }

    function watchLayout(item, node) {
        if (!hasEvent(node, "layout"))
            return;
        if (item.pulsarMeta.extra.layoutWatched === true)
            return;

        item.pulsarMeta.extra.layoutWatched = true;
        item.widthChanged.connect(function () { scheduleLayout(item); });
        item.heightChanged.connect(function () { scheduleLayout(item); });
        item.xChanged.connect(function () { scheduleLayout(item); });
        item.yChanged.connect(function () { scheduleLayout(item); });
        scheduleLayout(item);
    }

    function emitFocus(item, focused) {
        if (!item || !item.pulsarMeta || view.reordering)
            return;

        const event = focused ? "focus" : "blur";

        if (!hasEvent(item.pulsarMeta.node, event))
            return;

        emitEvent(item.pulsarMeta.node, event);
    }

    function watchFocus(item, node) {
        if (!hasEvent(node, "focus") && !hasEvent(node, "blur"))
            return;
        if (item.pulsarMeta.extra.focusWatched === true)
            return;

        item.pulsarMeta.extra.focusWatched = true;
        item.activeFocusChanged.connect(function () { emitFocus(item, item.activeFocus); });
    }

    function emitScroll(item) {
        if (!item || !item.pulsarMeta)
            return;
        if (!hasEvent(item.pulsarMeta.node, "scroll"))
            return;

        const extra = item.pulsarMeta.extra;

        if (extra.lastScrollOffset === item.contentY && extra.lastScrollHeight === item.contentHeight)
            return;

        extra.lastScrollOffset = item.contentY;
        extra.lastScrollHeight = item.contentHeight;
        emitEvent(item.pulsarMeta.node, "scroll", {
            offset: item.contentY,
            contentHeight: item.contentHeight,
            height: item.height
        });
    }

    function scheduleScroll(item) {
        if (!item || !item.pulsarMeta)
            return;

        const extra = item.pulsarMeta.extra;

        if (extra.scrollPending === true)
            return;

        extra.scrollPending = true;
        Qt.callLater(function () {
            if (!item || !item.pulsarMeta)
                return;

            extra.scrollPending = false;
            emitScroll(item);
        });
    }

    function watchScroll(item, node) {
        if (!hasEvent(node, "scroll"))
            return;
        if (item.pulsarMeta.extra.scrollWatched === true)
            return;
        if (item.contentY === undefined || item.contentHeight === undefined)
            return;

        item.pulsarMeta.extra.scrollWatched = true;
        item.contentYChanged.connect(function () { scheduleScroll(item); });
        item.contentHeightChanged.connect(function () { scheduleScroll(item); });
        item.heightChanged.connect(function () { scheduleScroll(item); });
        scheduleScroll(item);
    }

    function accessibleRole(name) {
        switch (name) {
        case "button": return Accessible.Button;
        case "checkbox": return Accessible.CheckBox;
        case "radio": return Accessible.RadioButton;
        case "switch": return Accessible.Switch;
        case "slider": return Accessible.Slider;
        case "text": return Accessible.StaticText;
        case "image": return Accessible.Image;
        case "list": return Accessible.List;
        case "listItem": return Accessible.ListItem;
        case "dialog": return Accessible.Dialog;
        case "link": return Accessible.Link;
        case "progress": return Accessible.ProgressBar;
        case "tab": return Accessible.PageTab;
        case "tabList": return Accessible.PageTabList;
        case "menu": return Accessible.Menu;
        case "menuItem": return Accessible.MenuItem;
        case "toolbar": return Accessible.ToolBar;
        case "group": return Accessible.Grouping;
        case "pane": return Accessible.Pane;
        default: return undefined;
        }
    }

    // A list or scroll inside another scroll area has no height to fill, so it
    // grows with its content and lets the outer area do the scrolling.
    function insideScroll(item) {
        for (let up = item.parent; up; up = up.parent) {
            const meta = up.pulsarMeta;

            if (meta && meta.node && (meta.node.type === "scroll" || meta.node.type === "list"))
                return true;
        }

        return false;
    }

    // Whether a node narrows to the width it is given and no further than its content: wrapping or eliding
    // text, and a row, column, card or box that holds one and has no width of its own.
    function shrinksToFit(node) {
        const props = node.props || {};

        if (props.width !== undefined)
            return false;

        if (node.type === "text" || node.type === "selectableText") {
            const elides = props.elide !== undefined && props.elide !== false && props.elide !== "";

            return elides || prop(props, "wrap", true) !== false;
        }

        if (node.type !== "row" && node.type !== "column" && node.type !== "card" && node.type !== "box")
            return false;

        return (node.children || []).some(function (child) {
            return shrinksToFit(child);
        });
    }

    function applyCommon(item, node, isRoot) {
        watchLayout(item, node);
        watchFocus(item, node);

        const props = node.props;
        const defaultFillWidth = node.type === "card" || node.type === "list" || node.type === "scroll"
                || node.type === "wrap" || node.type === "grid" || node.type === "virtualList" || node.type === "virtualRows"
                || node.type === "appBar" || node.type === "divider" || node.type === "textInput"
                || node.type === "textArea" || node.type === "pager" || node.type === "tabs"
                || node.type === "navRail" || node.type === "segmented"
                || node.type === "accordion" || node.type === "accordionSection"
                || node.type === "radioGroup" || node.type === "searchField"
                || node.type === "rangeSlider" || node.type === "navBar";
        const fill = prop(props, "fill", undefined);
        let fillWidth = defaultFillWidth;
        let fillHeight = node.type === "list" || node.type === "scroll" || node.type === "grid"
                || node.type === "virtualList" || node.type === "virtualRows" || node.type === "pager"
                || node.type === "navRail";

        if ((node.type === "list" || node.type === "scroll") && insideScroll(item))
            fillHeight = false;

        if (props.expand !== undefined)
            fillWidth = props.expand;
        if (fill !== undefined) {
            fillWidth = fill;
            fillHeight = fill;
        }
        // A size given by the app wins over the fill a type has by default.
        if (props.width !== undefined && fill === undefined && props.expand === undefined)
            fillWidth = false;
        if (props.height !== undefined && fill === undefined)
            fillHeight = false;
        if (props.fillWidth !== undefined)
            fillWidth = props.fillWidth;
        if (props.fillHeight !== undefined)
            fillHeight = props.fillHeight;

        // Filling up to the content's own width: it narrows when the space is short, and never stretches.
        const capped = !fillWidth && props.fillWidth === undefined && props.expand === undefined
                && fill === undefined && shrinksToFit(node);

        if (capped)
            fillWidth = true;

        if (node.type === "sheet" || node.type === "snackbar" || node.type === "popover" || node.type === "menu")
            return;

        const tooltip = prop(props, "tooltip", "");

        if (tooltip.length > 0)
            applyTooltip(item, tooltip);

        const a11yLabel = prop(props, "a11yLabel", "");
        const a11yHint = prop(props, "a11yHint", "");

        if (a11yLabel.length > 0)
            item.Accessible.name = a11yLabel;
        if (a11yHint.length > 0)
            item.Accessible.description = a11yHint;

        const a11yRole = String(prop(props, "a11yRole", ""));

        if (a11yRole.length > 0) {
            const role = accessibleRole(a11yRole);

            if (role !== undefined)
                item.Accessible.role = role;
        }

        if (props.a11yChecked !== undefined) {
            item.Accessible.checkable = true;
            item.Accessible.checked = props.a11yChecked === true;
        }

        let defaultElevation = 0;

        if (node.type === "fab")
            defaultElevation = 4;
        else if (node.type === "button" && prop(props, "variant", "solid") === "elevated")
            defaultElevation = 1;

        const elevation = prop(props, "elevation", defaultElevation);

        applyElevation(item, elevation, props.shadowColor);

        if (props.width !== undefined) {
            item.width = props.width;
            item.Layout.preferredWidth = props.width;
        }

        if (props.height !== undefined) {
            item.height = props.height;
            item.Layout.preferredHeight = props.height;
        }

        applyMotion(item, node);
        applyLayoutLimits(item, props);
        applyVisible(item, props);

        const animate = prop(props, "animate", 0);
        const hasOpacity = props.opacity !== undefined || item.pulsarMeta.extra.animateFrom !== undefined;

        if (hasOpacity) {
            const target = props.opacity !== undefined ? props.opacity : 1;
            const previous = item.pulsarMeta.extra.lastOpacity !== undefined
                    ? item.pulsarMeta.extra.lastOpacity
                    : (item.pulsarMeta.extra.animateFrom !== undefined ? item.pulsarMeta.extra.animateFrom : target);

            if (animate > 0 && previous !== target) {
                item.opacity = previous;
                animateOpacity(item, target, animate);
            } else {
                item.opacity = target;
            }

            item.pulsarMeta.extra.lastOpacity = target;
            delete item.pulsarMeta.extra.animateFrom;
        }

        const flexed = item.pulsarMeta.extra.flexed === true && props.flex > 0;
        const flexedAcross = flexed && item.pulsarMeta.extra.flexHorizontal === true;
        const flexedDown = flexed && item.pulsarMeta.extra.flexHorizontal === false;

        item.Layout.fillWidth = fillWidth || flexedAcross;

        if (capped && props.maxWidth === undefined) {
            item.Layout.maximumWidth = Qt.binding(function () {
                return item.implicitWidth;
            });
        }
        item.Layout.fillHeight = fillHeight || flexedDown;

        if ((node.type === "column" || node.type === "row") && fillWidth && props.maxWidth === undefined)
            item.Layout.maximumWidth = Number.POSITIVE_INFINITY;

        if ((node.type === "column" || node.type === "row") && fillHeight && props.maxHeight === undefined)
            item.Layout.maximumHeight = Number.POSITIVE_INFINITY;

        if (props.enabled !== undefined)
            item.enabled = props.enabled;

        if (props.rotation !== undefined)
            item.rotation = props.rotation;

        applySpin(item, prop(props, "spinSpeed", 0));
        applyBlur(item, prop(props, "blur", 0));
        applyGlass(item, props.glass, prop(props, "radius", 0));

        ensureHover(item, props);

        if (!stateHasColor(node))
            refreshStates(item);

        if (props.maxWidth !== undefined)
            item.Layout.maximumWidth = props.maxWidth;

        if (props.align !== undefined) {
            const align = props.align;

            item.Layout.alignment = align === "center" ? Qt.AlignHCenter
                    : align === "right" || align === "end" ? Qt.AlignRight
                    : Qt.AlignLeft;
        }

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
            item.pulsarMeta.extra.gap = prop(props, "gap", 0);
            item.spacing = node.type === "column" ? 0 : item.pulsarMeta.extra.gap;
            reconcile(item, node.children || [], false);
            applyPadding(item, paddingEdges(props, 0), node.type === "row");
            applyCrossAlign(item, props.alignItems, node.type === "row");
            applyFlex(item, node.type === "row", paddingEdges(props, 0));
            packMainAxis(item, node.type === "row");
        } else if (node.type === "wrap") {
            const gap = prop(props, "gap", view.themeSpacing);
            const padding = prop(props, "padding", 0);

            let flow = item.pulsarMeta.content;

            if (!flow) {
                flow = make("import QtQuick; Flow { property var pulsarMeta: null }", item);
                flow.pulsarMeta = contentMeta();
                item.pulsarMeta.content = flow;
                flow.x = Qt.binding(function () {
                    return prop(item.pulsarMeta.node.props, "padding", 0);
                });
                flow.y = Qt.binding(function () {
                    return prop(item.pulsarMeta.node.props, "padding", 0);
                });
                flow.width = Qt.binding(function () {
                    return Math.max(0, item.width - 2 * prop(item.pulsarMeta.node.props, "padding", 0));
                });
                item.implicitHeight = Qt.binding(function () {
                    return flow.implicitHeight + 2 * prop(item.pulsarMeta.node.props, "padding", 0);
                });
            }

            flow.spacing = gap;
            flow.flow = Flow.LeftToRight;
            reconcile(flow, node.children || [], false);
        } else if (node.type === "stack") {
            reconcile(item, node.children || [], false);

            for (let i = 0; i < item.children.length; i++) {
                const child = item.children[i];
                const childNode = child.pulsarMeta ? child.pulsarMeta.node : null;
                const childProps = childNode ? childNode.props : ({});

                if (childProps.absolute) {
                    applyAbsolute(child, item, childProps.absolute);
                    child.pulsarMeta.extra.stackAnchored = true;

                    continue;
                }

                if (child.pulsarMeta && child.pulsarMeta.extra.stackAnchored)
                    continue;

                if (childProps.width !== undefined || childProps.height !== undefined || childProps.align !== undefined) {
                    child.anchors.centerIn = item;
                } else {
                    child.anchors.fill = item;
                }

                if (child.pulsarMeta)
                    child.pulsarMeta.extra.stackAnchored = true;
            }
        } else if (node.type === "arrange") {
            const glide = prop(props, "transition", ({}));

            if (!item.pulsarMeta.index)
                item.pulsarMeta.index = ({});

            item.setSource(prop(props, "arrangeSource", ""));
            item.setParams(prop(props, "params", ({})), glide.duration !== undefined ? glide.duration : 0, glide.curve || "ease");
            item.animated = prop(props, "animated", false);
            reconcile(item, node.children || [], false);
            item.place();
        } else if (node.type === "shader") {
            applyShader(item, props);
        } else if (node.type === "canvas") {
            item.setSource(prop(props, "drawSource", ""));
            item.params = prop(props, "params", ({}));
            item.animated = prop(props, "animated", false);
            item.fps = prop(props, "fps", 60);
            item.requestPaint();
        } else if (node.type === "box") {
            item.color = resolveColor(prop(props, "color", "transparent"), "transparent");
            ensureHover(item, props);
            item.radius = prop(props, "radius", 0);
            item.border.width = prop(props, "borderWidth", 0);
            item.border.color = resolveColor(prop(props, "borderColor", view.themeBorder), view.themeBorder);
            applyGradient(item, prop(props, "gradient", null));
            refreshStates(item);

            let inner = item.pulsarMeta.content;
            const edges = paddingEdges(props, 0);

            if (!inner) {
                inner = makeContent(item);
                inner.anchors.fill = item;
                item.pulsarMeta.content = inner;
            }

            applyContentPadding(inner, edges);
            inner.spacing = 0;
            item.implicitWidth = Qt.binding(function () {
                return inner.implicitWidth + edges.left + edges.right;
            });
            item.implicitHeight = Qt.binding(function () {
                return inner.implicitHeight + edges.top + edges.bottom;
            });
            reconcile(inner, node.children || [], false);
            applyFlex(inner, false, ({ top: 0, right: 0, bottom: 0, left: 0 }));
            packMainAxis(inner, false);
        } else if (node.type === "scroll" || node.type === "list") {
            item.maximumFlickVelocity = prop(props, "flick", true) === false ? 0 : 8000;
            item.boundsBehavior = Qt.binding(function () {
                return prop(item.pulsarMeta.node.props, "overscroll", true)
                        && item.contentHeight > item.height
                        && item.contentY > item.originY + 1
                        ? Flickable.DragOverBounds
                        : Flickable.StopAtBounds;
            });

            watchScroll(item, node);
            applyScrollKey(item, props);

            const contentColumn = (node.children || [])[0];
            const firstChild = contentColumn && contentColumn.children ? contentColumn.children[0] : null;

            item.pulsarMeta.extra.topInset =
                    firstChild && (firstChild.type === "textInput" || firstChild.type === "textArea")
                        ? Math.round(view.fs(8)) : 0;

            let wrapper = item.pulsarMeta.content;

            if (!wrapper) {
                const contentParent = item.contentItem !== null && item.contentItem !== undefined
                        ? item.contentItem : item;

                wrapper = makeWrapper(contentParent);
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
                    return inner.implicitHeight
                            + 2 * prop(item.pulsarMeta.node.props, "padding", 0)
                            + (item.pulsarMeta.extra.topInset || 0);
                });
                inner.x = Qt.binding(function () {
                    return prop(item.pulsarMeta.node.props, "padding", 0);
                });
                inner.y = Qt.binding(function () {
                    return prop(item.pulsarMeta.node.props, "padding", 0)
                            + (item.pulsarMeta.extra.topInset || 0);
                });
                inner.width = Qt.binding(function () {
                    return Math.max(0, wrapper.width - 2 * prop(item.pulsarMeta.node.props, "padding", 0));
                });
            }

            if (insideScroll(item)) {
                item.interactive = false;
                item.implicitHeight = Qt.binding(function () {
                    return item.contentHeight;
                });
            }

            const inner = wrapper.pulsarMeta.content;
            inner.spacing = node.type === "list" ? prop(props, "spacing", 0) : prop(props, "gap", view.themeSpacing);
            reconcile(inner, node.children || [], false);
        } else if (node.type === "grid") {
            const gap = prop(props, "gap", view.themeSpacing);
            const padding = prop(props, "padding", 0);

            const gridColumns = prop(props, "columns", 2);

            if (gridColumns === "auto") {
                const minColumnWidth = prop(props, "minColumnWidth", 160);

                item.gridLayout.columns = Qt.binding(function () {
                    const available = Math.max(0, item.gridLayout.width - 2 * padding);

                    return Math.max(1, Math.floor((available + gap) / (minColumnWidth + gap)));
                });
            } else {
                item.gridLayout.columns = gridColumns;
            }

            item.gridLayout.columnSpacing = gap;
            item.gridLayout.rowSpacing = gap;
            item.gridLayout.padding = padding;

            if (!item.gridLayout.pulsarMeta)
                item.gridLayout.pulsarMeta = contentMeta();

            reconcile(item.gridLayout, node.children || [], false);

            for (let i = 0; i < item.gridLayout.children.length; i++) {
                const cell = item.gridLayout.children[i];
                const cellNode = cell.pulsarMeta ? cell.pulsarMeta.node : null;
                const cellProps = cellNode ? cellNode.props : ({});

                if (cell.Layout !== undefined && cellProps.width === undefined
                        && cellProps.fillWidth !== false)
                    cell.Layout.fillWidth = true;
            }
        } else if (node.type === "virtualRows") {
            item.nodeData = node;
            item.rowHeight = prop(props, "rowHeight", 56);
            item.rowCount = prop(props, "count", 0);
            item.firstRow = prop(props, "start", 0);

            if (!item.rows.pulsarMeta)
                item.rows.pulsarMeta = contentMeta();

            reconcile(item.rows, node.children || [], false);

            const rowItems = item.rows.children;

            for (let i = 0; i < rowItems.length; i++) {
                const row = rowItems[i];

                row.x = 0;
                row.y = i * item.rowHeight;
                row.height = item.rowHeight;
                row.width = Qt.binding(function () {
                    return item.rows.width;
                });
            }

            item.scheduleReport();
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
            list.interactive = prop(props, "interactive", true);

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
            item.color = resolveColor(prop(props, "color", view.themeSurface), view.themeSurface);
            ensureHover(item, props);
            item.radius = prop(props, "radius", view.themeRadius);
            item.border.width = prop(props, "borderWidth", 1);
            item.border.color = resolveColor(prop(props, "borderColor", view.themeBorder), view.themeBorder);
            applyGradient(item, prop(props, "gradient", null));
            refreshStates(item);

            let inner = item.pulsarMeta.content;
            const edges = paddingEdges(props, 16);

            if (!inner) {
                inner = makeContent(item);
                inner.anchors.fill = item;
                item.pulsarMeta.content = inner;
            }

            applyContentPadding(inner, edges);
            item.implicitWidth = Qt.binding(function () {
                return inner.implicitWidth + edges.left + edges.right;
            });
            item.implicitHeight = Qt.binding(function () {
                return inner.implicitHeight + edges.top + edges.bottom;
            });
            inner.spacing = view.themeSpacing;
            reconcile(inner, node.children || [], false);
            applyFlex(inner, false, ({ top: 0, right: 0, bottom: 0, left: 0 }));
            packMainAxis(inner, false);
        } else if (node.type === "appBar") {
            const barText = prop(props, "textColor", undefined);

            item.nodeData = node;
            item.color = resolveColor(prop(props, "color", view.themeSurface), view.themeSurface);
            item.titleLabel.text = prop(props, "title", "");
            item.subtitleLabel.text = prop(props, "subtitle", "");
            item.subtitleLabel.visible = item.subtitleLabel.text.length > 0;
            item.titleLabel.color = barText !== undefined ? resolveColor(barText, view.themeText) : view.themeText;
            item.subtitleLabel.color = barText !== undefined ? resolveColor(barText, view.themeTextSecondary) : view.themeTextSecondary;
            item.backButton.visible = hasEvent(node, "back");
            item.implicitHeight = prop(props, "height", 56);

            if (!item.actionsRow.pulsarMeta)
                item.actionsRow.pulsarMeta = contentMeta();

            reconcile(item.actionsRow, node.children || [], false);
        } else if (node.type === "chip") {
            const chipVariant = prop(props, "variant", "solid");
            const chipColor = resolveColor(prop(props, "color", view.themeSurfaceVariant), view.themeSurfaceVariant);
            const chipSelected = prop(props, "selected", false);
            const chipFill = chipSelected
                    ? resolveColor(prop(props, "selectedColor", chipColor), chipColor)
                    : chipColor;
            const chipText = prop(props, "textColor", undefined);

            item.nodeData = node;
            item.labelItem.text = prop(props, "label", "");
            item.color = chipVariant === "outline"
                    ? (chipSelected ? view.withAlpha(chipFill, 0.22) : "transparent")
                    : chipFill;
            item.border.width = chipVariant === "outline" ? (chipSelected ? 2 : 1) : 0;
            item.border.color = chipFill;
            item.labelItem.font.bold = chipSelected;
            item.labelItem.color = chipText !== undefined
                    ? resolveColor(chipText, view.themeText)
                    : (chipVariant === "outline" ? chipFill : view.themeText);
            item.removeButton.visible = hasEvent(node, "remove");
            item.implicitWidth = Qt.binding(function () {
                const removeWidth = item.removeButton.visible
                        ? item.removeButton.implicitWidth + 18
                        : 24;

                return item.labelItem.implicitWidth + removeWidth;
            });
        } else if (node.type === "sheet") {
            const placement = prop(props, "placement", "center");

            item.nodeData = node;
            item.dismissible = prop(props, "dismissible", true);
            item.fadeDuration = prop(props, "duration", 140);
            item.isBottom = placement === "bottom";
            item.showHandle = prop(props, "handle", true);
            item.open = prop(props, "open", true);
            item.titleLabel.text = prop(props, "title", "");
            item.closeButton.visible = hasEvent(node, "close");
            item.panel.pulsarElevation = prop(props, "elevation", 3);
            item.panel.pulsarShadowColor = resolveColor(props.shadowColor, view.themeShadow);

            if (item.isBottom) {
                item.panel.width = Qt.binding(function () {
                    return Math.max(240, Math.min(item.width - 16, 640));
                });
                item.panel.height = Qt.binding(function () {
                    return Math.min(item.height * 0.75, 560);
                });
                item.panel.x = Qt.binding(function () {
                    return (item.width - item.panel.width) / 2;
                });
                item.panel.y = Qt.binding(function () {
                    return item.height - item.panel.height - 8;
                });
            } else if (props.fullscreen) {
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

            applyTabPalette(item.tabBar);

            item.syncing = true;
            item.tabBar.currentIndex = tabIndex;
            item.syncing = false;

            Qt.callLater(function () {
                if (!item)
                    return;

                item.syncing = true;
                item.tabBar.currentIndex = tabIndex;
                item.syncing = false;
            });

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

            applyTabPalette(item);

            const segmentIndex = prop(props, "value", 0);

            item.syncing = true;
            item.currentIndex = segmentIndex;
            item.syncing = false;

            Qt.callLater(function () {
                if (!item)
                    return;

                item.syncing = true;
                item.currentIndex = segmentIndex;
                item.syncing = false;
            });
        } else if (node.type === "navRail") {
            item.nodeData = node;
            item.navItems = prop(props, "items", []);
            item.expanded = prop(props, "expanded", true);
            item.syncing = true;
            item.currentIndex = prop(props, "index", 0);
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

            applyPadding(item, paddingEdges(props, 0), true);
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
            item.panel.pulsarElevation = prop(props, "elevation", 3);
            item.panel.pulsarShadowColor = resolveColor(props.shadowColor, view.themeShadow);

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
        } else if (node.type === "video") {
            if (item.sync === undefined)
                return;

            item.nodeData = node;
            item.muted = prop(props, "muted", false);
            item.loop = prop(props, "loop", false);
            item.autoplay = prop(props, "autoplay", false);
            item.fillMode = prop(props, "fillMode", "contain");
            item.volume = prop(props, "volume", 1);
            item.paused = props.paused === undefined ? undefined : props.paused === true;

            const videoSource = prop(props, "source", "");
            const videoBase = PulsarBridge.env("PULSAR_APP") || "";

            item.source = videoSource.length === 0 ? ""
                    : /^[a-z][a-z0-9+.-]*:/i.test(videoSource) ? videoSource
                    : "file://" + (videoSource.charAt(0) === "/" ? videoSource : videoBase + "/" + videoSource);
            item.sync();
        } else if (node.type === "qml") {
            item.nodeData = node;

            const source = prop(props, "source", "");
            const base = PulsarBridge.env("PULSAR_APP") || "";
            const url = source.length === 0 ? ""
                    : /^[a-z][a-z0-9+.-]*:/i.test(source) ? source
                    : "file://" + (source.charAt(0) === "/" ? source : base + "/" + source);

            // Loader.source is a url, so a plain comparison with the string always differs and reloads the item.
            if (item.source.toString() !== url) {
                releaseMedia(item.item);

                if (url.length === 0) {
                    item.source = "";
                } else {
                    item.setSource(url, prop(props, "props", {}));
                }
            }

            applyQmlProps(item, node);
        } else if (node.type === "text" || node.type === "selectableText") {
            // Text wraps at word boundaries unless the app says otherwise. An elided text with no explicit
            // wrap stays on one line, and with maxLines it wraps up to that many.
            const elides = props.elide !== undefined && props.elide !== false && props.elide !== "";
            const wrap = prop(props, "wrap", !elides || props.maxLines !== undefined);
            const align = prop(props, "align", "left");
            const weight = prop(props, "weight", undefined);

            item.text = prop(props, "text", "");
            item.color = resolveColor(prop(props, "color", view.themeText), view.themeText);
            item.font.pixelSize = view.fs(prop(props, "size", 15));
            item.font.bold = prop(props, "bold", false);
            item.font.italic = prop(props, "italic", false);
            item.font.strikeout = prop(props, "strike", false);
            item.textFormat = prop(props, "markdown", false) ? Text.MarkdownText : Text.PlainText;
            item.horizontalAlignment = align === "center" ? Text.AlignHCenter
                    : align === "right" ? Text.AlignRight : Text.AlignLeft;
            item.wrapMode = wrap ? Text.WordWrap : Text.NoWrap;

            if (weight !== undefined)
                item.font.weight = fontWeight(weight);
            if (props.letterSpacing !== undefined)
                item.font.letterSpacing = props.letterSpacing;
            if (props.lineHeight !== undefined && node.type === "text")
                item.lineHeight = props.lineHeight;
            item.font.family = prop(props, "family", view.fontFamily);

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

            if (props.width === undefined)
                item.Layout.preferredWidth = -1;
        } else if (node.type === "button") {
            const variant = prop(props, "variant", "solid");
            const size = prop(props, "size", "md");
            const fill = resolveColor(prop(props, "color", view.themePrimary), view.themePrimary);
            const explicitText = prop(props, "textColor", undefined);

            item.text = prop(props, "label", "");
            item.enabled = prop(props, "enabled", true);
            item.variant = variant;
            item.fillColor = fill;
            item.radius = prop(props, "radius", view.themeRadius);
            item.iconName = prop(props, "icon", "");
            item.iconPosition = prop(props, "iconPosition", "left");
            item.font.pixelSize = view.fs(size === "sm" ? 13 : size === "lg" ? 17 : 15);
            item.font.weight = 500;
            item.font.bold = false;
            item.leftPadding = size === "sm" ? 12 : size === "lg" ? 20 : 16;
            item.rightPadding = item.leftPadding;
            item.topPadding = size === "sm" ? 4 : size === "lg" ? 12 : 8;
            item.bottomPadding = item.topPadding;
            item.implicitHeight = size === "sm" ? 32 : size === "lg" ? 48 : 40;
            item.labelColor = explicitText !== undefined
                    ? resolveColor(explicitText, item.labelColor)
                    : (variant === "soft" || variant === "outline" || variant === "ghost")
                        ? fill
                        : view.themeOnPrimary;

        } else if (node.type === "icon") {
            const align = prop(props, "align", "left");

            item.text = prop(props, "name", "");
            item.font.family = view.iconFamily;
            item.font.pixelSize = view.fs(prop(props, "size", 24));
            item.color = resolveColor(prop(props, "color", view.themeText), view.themeText);
            item.horizontalAlignment = align === "center" ? Text.AlignHCenter
                    : align === "right" || align === "end" ? Text.AlignRight : Text.AlignLeft;
        } else if (node.type === "iconButton") {
            const iconColor = resolveColor(prop(props, "color", view.themeText), view.themeText);

            item.text = prop(props, "name", "");
            item.enabled = prop(props, "enabled", true);
            item.font.family = view.iconFamily;
            item.font.pixelSize = view.fs(prop(props, "size", 24));
            item.implicitWidth = 40;
            item.implicitHeight = 40;
            item.palette.buttonText = iconColor;
            item.palette.windowText = iconColor;
            item.palette.text = iconColor;

            if (item.contentItem && item.contentItem.color !== undefined)
                item.contentItem.color = iconColor;
        } else if (node.type === "textInput" || node.type === "textArea") {
            const keyboard = prop(props, "keyboardType", "text");

            item.placeholderText = prop(props, "placeholder", "");
            item.readOnly = prop(props, "readOnly", false);
            item.font.strikeout = prop(props, "strike", false);

            const inputVariant = prop(props, "variant", "filled");
            const outlined = inputVariant === "outline";

            item.outlined = outlined;
            item.fieldColor = outlined ? "transparent"
                    : resolveColor(prop(props, "color", view.themeSurfaceVariant), view.themeSurfaceVariant);
            item.fieldRadius = prop(props, "radius", 8);
            item.fieldBorderColor = resolveColor(prop(props, "borderColor", view.themeBorder), view.themeBorder);
            item.fieldFocusColor = resolveColor(prop(props, "focusBorderColor", view.themePrimary), view.themePrimary);
            item.color = resolveColor(prop(props, "textColor", view.themeText), view.themeText);
            item.placeholderTextColor = view.themeTextSecondary;

            if (props.maxLength !== undefined)
                item.maximumLength = props.maxLength;

            if (props.selectable !== undefined)
                item.selectByMouse = props.selectable;

            if (node.type === "textInput") {
                if (hasEvent(node, "submit"))
                    item.EnterKey.type = Qt.EnterKeyDone;

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

                // `lines` is the starting height; the area grows with its text so the
                // cursor never drops below the field onto the controls under it.
                if (props.lines !== undefined && props.height === undefined) {
                    const minimum = props.lines * 24;

                    item.Layout.preferredHeight = Qt.binding(function () {
                        return Math.max(minimum, item.implicitHeight);
                    });
                }
            }

            syncFieldText(item, prop(props, "value", ""));

            if (prop(props, "autoFocus", false) && item.pulsarMeta.extra.autoFocused !== true) {
                item.pulsarMeta.extra.autoFocused = true;
                Qt.callLater(function () {
                    item.forceActiveFocus();
                });
            }

            const focusWanted = prop(props, "focus", false);

            if (focusWanted && item.pulsarMeta.extra.focusRequested !== true) {
                item.pulsarMeta.extra.focusRequested = true;
                Qt.callLater(function () {
                    item.forceActiveFocus();
                    Qt.inputMethod.show();
                });
            } else if (!focusWanted) {
                item.pulsarMeta.extra.focusRequested = false;
            }
        } else if (node.type === "checkbox" || node.type === "switch") {
            item.text = prop(props, "label", "");
            item.pulsarMeta.syncing = true;
            item.checked = prop(props, "checked", false);
            item.pulsarMeta.syncing = false;
        } else if (node.type === "slider") {
            const sliderColor = prop(props, "color", undefined);

            item.pulsarMeta.syncing = true;
            item.value = prop(props, "value", 0);
            item.from = prop(props, "min", 0);
            item.to = prop(props, "max", 100);
            item.pulsarMeta.syncing = false;

            if (sliderColor !== undefined) {
                item.palette.highlight = resolveColor(sliderColor, view.themePrimary);
                item.palette.accent = resolveColor(sliderColor, view.themePrimary);
            }
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
            item.enabled = prop(props, "enabled", true);
            item.font.family = view.fontFamily;
            item.font.pixelSize = view.fs(15);
            item.implicitHeight = Math.max(44, view.fs(15) + 28);
            item.leftPadding = 12;
            item.rightPadding = 40;
            item.Layout.preferredWidth = prop(props, "expand", false) ? -1 : prop(props, "width", 200);
            item.palette.text = view.themeText;
            item.palette.windowText = view.themeText;
            item.palette.buttonText = view.themeText;
            item.palette.base = view.themeSurface;
            item.palette.window = view.themeSurface;
            item.palette.highlight = view.themePrimary;
            item.palette.highlightedText = view.themeOnPrimary;

            if (item.contentItem && item.contentItem.color !== undefined)
                item.contentItem.color = view.themeText;

            if (!item.pulsarMeta.extra.selectChrome) {
                const background = make("import QtQuick; Rectangle { }", item);

                background.radius = 8;
                background.color = "transparent";
                background.border.width = 1;
                background.border.color = Qt.binding(function () {
                    return view.themeBorder;
                });
                item.background = background;

                const indicator = make("import QtQuick.Controls; Label { }", item);

                indicator.text = "arrow_drop_down";
                indicator.font.family = view.iconFamily;
                indicator.font.pixelSize = view.fs(20);
                indicator.color = Qt.binding(function () {
                    return view.themeTextSecondary;
                });
                indicator.anchors.right = item.right;
                indicator.anchors.rightMargin = 12;
                indicator.anchors.verticalCenter = item.verticalCenter;
                item.indicator = indicator;
                item.pulsarMeta.extra.selectChrome = true;
            }

            if (props.color !== undefined) {
                item.palette.highlight = resolveColor(props.color, view.themePrimary);
                item.palette.accent = resolveColor(props.color, view.themePrimary);
            }
        } else if (node.type === "progress") {
            item.indeterminate = prop(props, "indeterminate", false);
            item.value = Math.max(0, Math.min(1, prop(props, "value", 0)));
            item.Layout.preferredWidth = prop(props, "expand", false) ? -1 : prop(props, "width", 160);

            if (props.color !== undefined) {
                item.palette.highlight = resolveColor(props.color, view.themePrimary);
                item.palette.accent = resolveColor(props.color, view.themePrimary);
            }
        } else if (node.type === "image") {
            const boxed = props.width !== undefined && props.height !== undefined;

            // Only with a known size: an image of unknown size would shift the layout when it arrives.
            item.asynchronous = boxed;

            if (boxed) {
                const side = Math.ceil(Math.max(props.width, props.height) * view.screen.devicePixelRatio * 2);

                item.sourceSize = Qt.size(side, side);
            }

            item.source = prop(props, "src", "");

            if (props.fillMode !== undefined)
                item.fillMode = props.fillMode;
        } else if (node.type === "avatar") {
            const name = prop(props, "name", "");
            const parts = name.trim().length > 0 ? name.trim().split(/\s+/) : [];
            const size = prop(props, "size", 40);
            const status = prop(props, "status", "");
            const statusColors = { online: "green", away: "yellow", busy: "red", offline: "overlay" };
            const accents = ["mauve", "blue", "teal", "peach", "green", "lavender"];

            let hash = 0;

            for (let i = 0; i < name.length; i++)
                hash = (hash * 31 + name.charCodeAt(i)) % 100000;

            item.src = prop(props, "src", "");
            item.initials = parts.length > 0
                    ? parts.slice(0, 2).map(function (part) { return part.charAt(0); }).join("").toUpperCase()
                    : "?";
            item.avatarSize = size;
            item.avatarRadius = prop(props, "radius", size / 2);
            item.fallbackColor = resolveColor(accents[hash % accents.length], view.themeSurfaceVariant);
            item.fallbackTextColor = view.themeOnPrimary;
            item.status = status;
            item.statusColor = props.statusColor !== undefined
                    ? resolveColor(props.statusColor, view.themePrimary)
                    : resolveColor(statusColors[status] ?? "", view.themePrimary);
        } else if (node.type === "badge") {
            const count = prop(props, "count", undefined);
            const dot = prop(props, "dot", false);

            item.dot = dot;
            item.label = prop(props, "label", count !== undefined ? (Number(count) > 99 ? "99+" : String(count)) : "");
            item.badgeColor = resolveColor(prop(props, "color", view.themePrimary), view.themePrimary);
            item.badgeTextColor = resolveColor(prop(props, "textColor", view.themeOnPrimary), view.themeOnPrimary);
        } else if (node.type === "skeleton") {
            const skeletonVariant = prop(props, "variant", "rect");
            const skeletonWidth = props.width !== undefined
                    ? props.width : (skeletonVariant === "circle" ? 40 : 120);
            const skeletonHeight = props.height !== undefined
                    ? props.height : (skeletonVariant === "circle" ? skeletonWidth : skeletonVariant === "text" ? 12 : 80);

            item.variant = skeletonVariant;
            item.baseRadius = prop(props, "radius", skeletonVariant === "text" ? 6 : 8);
            item.animated = prop(props, "animated", true);
            item.width = skeletonWidth;
            item.height = skeletonHeight;
            item.Layout.preferredWidth = skeletonWidth;
            item.Layout.preferredHeight = skeletonHeight;
        } else if (node.type === "spinner") {
            const spinnerSize = prop(props, "size", 24);

            item.spinnerSize = spinnerSize;
            item.spinnerColor = resolveColor(prop(props, "color", view.themePrimary), view.themePrimary);
            item.spinnerValue = prop(props, "value", -1);
            item.thickness = prop(props, "thickness", Math.max(2, spinnerSize * 0.1));
            item.Layout.preferredWidth = spinnerSize;
            item.Layout.preferredHeight = spinnerSize;
        } else if (node.type === "spacer") {
            const size = prop(props, "size", 0);
            item.Layout.preferredWidth = prop(props, "width", size);
            item.Layout.preferredHeight = prop(props, "height", size);
        } else if (node.type === "radio") {
            item.nodeData = node;
            item.text = prop(props, "label", "");
            item.accent = resolveColor(prop(props, "color", view.themePrimary), view.themePrimary);
            item.enabled = prop(props, "enabled", true);
            item.pulsarMeta.syncing = true;
            item.checked = prop(props, "checked", false);
            item.pulsarMeta.syncing = false;
        } else if (node.type === "radioGroup") {
            const groupOptions = prop(props, "options", []);
            const groupKey = JSON.stringify(groupOptions);

            item.nodeData = node;
            item.horizontal = prop(props, "direction", "vertical") === "horizontal";
            item.accent = resolveColor(prop(props, "color", view.themePrimary), view.themePrimary);
            item.value = prop(props, "value", undefined);

            if (item.pulsarMeta.extra.optionsKey !== groupKey) {
                item.pulsarMeta.extra.optionsKey = groupKey;
                item.options = groupOptions;
            }
        } else if (node.type === "accordion") {
            item.nodeData = node;
            item.multiple = prop(props, "multiple", true);
            reconcile(item, node.children || [], false);
        } else if (node.type === "accordionSection") {
            item.nodeData = node;
            item.accordionRoot = item.parent && item.parent.multiple !== undefined ? item.parent : null;
            item.title = prop(props, "title", "");
            item.subtitle = prop(props, "subtitle", "");
            item.iconName = prop(props, "icon", "");
            item.sectionEnabled = prop(props, "enabled", true);

            if (props.open !== undefined) {
                item.setOpen(Boolean(props.open));
            } else if (item.pulsarMeta.extra.initialized !== true) {
                item.opened = Boolean(prop(props, "defaultOpen", false));
            }

            item.pulsarMeta.extra.initialized = true;

            if (!item.contentLayout.pulsarMeta)
                item.contentLayout.pulsarMeta = contentMeta();

            reconcile(item.contentLayout, node.children || [], false);
        } else if (node.type === "menu") {
            const menuItems = prop(props, "items", []);
            const menuKey = JSON.stringify(menuItems);
            const menuWidth = prop(props, "width", 220);

            item.nodeData = node;
            item.open = prop(props, "open", true);
            item.modal = prop(props, "modal", false);
            item.dismissible = prop(props, "dismissible", true);
            item.closeOnSelect = prop(props, "closeOnSelect", true);
            item.fadeDuration = prop(props, "duration", 120);
            item.menuWidth = menuWidth;
            item.maxHeight = prop(props, "maxHeight", 360);
            item.panel.x = prop(props, "x", Math.max(16, item.width - menuWidth - 16));
            item.panel.y = prop(props, "y", 16);
            item.panel.pulsarElevation = prop(props, "elevation", 3);
            item.panel.pulsarShadowColor = resolveColor(props.shadowColor, view.themeShadow);

            if (item.pulsarMeta.extra.itemsKey !== menuKey) {
                item.pulsarMeta.extra.itemsKey = menuKey;
                item.items = menuItems;
            }
        } else if (node.type === "fab") {
            const fabSize = prop(props, "size", 56);
            const fabPlacement = prop(props, "placement", "bottom-end");

            item.nodeData = node;
            item.iconName = prop(props, "icon", "");
            item.fabSize = fabSize;
            item.floating = fabPlacement !== "inline";
            item.fabEnabled = prop(props, "enabled", true);
            item.fabColor = resolveColor(prop(props, "color", view.themePrimary), view.themePrimary);
            item.fabTextColor = resolveColor(prop(props, "textColor", view.themeOnPrimary), view.themeOnPrimary);
            item.width = fabSize;
            item.height = fabSize;
            item.implicitWidth = fabSize;
            item.implicitHeight = fabSize;
            item.updateAnchors();
        } else if (node.type === "searchField") {
            const searchOutlined = prop(props, "variant", "filled") === "outline";
            const searchValue = prop(props, "value", item.text);

            item.nodeData = node;
            item.hint = prop(props, "placeholder", "Search");
            item.outlined = searchOutlined;
            item.fieldColor = searchOutlined ? "transparent"
                    : resolveColor(prop(props, "color", view.themeSurfaceVariant), view.themeSurfaceVariant);
            item.fieldRadius = prop(props, "radius", 8);
            item.fieldBorderColor = resolveColor(prop(props, "borderColor", view.themeBorder), view.themeBorder);
            item.debounce = prop(props, "debounce", 0);
            item.enabled = prop(props, "enabled", true);

            syncFieldText(item, searchValue);

            const focusWanted = prop(props, "focus", false);

            if (focusWanted && item.pulsarMeta.extra.focusRequested !== true) {
                item.pulsarMeta.extra.focusRequested = true;
                Qt.callLater(function () {
                    item.forceActiveFocus();
                    Qt.inputMethod.show();
                });
            } else if (!focusWanted) {
                item.pulsarMeta.extra.focusRequested = false;
            }
        } else if (node.type === "rangeSlider") {
            const rangeColor = resolveColor(prop(props, "color", view.themePrimary), view.themePrimary);

            item.nodeData = node;
            item.pulsarMeta.syncing = true;
            item.from = prop(props, "min", 0);
            item.to = prop(props, "max", 100);
            item.stepSize = prop(props, "step", 0);
            item.first.value = prop(props, "from", item.from);
            item.second.value = prop(props, "to", item.to);
            item.pulsarMeta.syncing = false;
            item.palette.highlight = rangeColor;
            item.palette.accent = rangeColor;
            item.Layout.preferredWidth = prop(props, "expand", false) ? -1 : prop(props, "width", 200);
        } else if (node.type === "navBar") {
            const navItems = prop(props, "items", []);
            const navKey = JSON.stringify(navItems);

            item.nodeData = node;
            item.currentIndex = prop(props, "value", 0);
            item.showLabels = prop(props, "showLabels", true);
            item.barColor = resolveColor(prop(props, "color", view.themeSurface), view.themeSurface);
            item.accent = resolveColor(prop(props, "activeColor", view.themePrimary), view.themePrimary);

            if (item.pulsarMeta.extra.itemsKey !== navKey) {
                item.pulsarMeta.extra.itemsKey = navKey;
                item.items = navItems;
            }
        } else if (node.type === "neon") {
            item.nodeData = node;
            item.pad = prop(props, "padding", 24);
            item.neonColor = resolveColor(prop(props, "color", view.themePrimary), view.themePrimary);
            item.neonIntensity = prop(props, "intensity", 1);
            item.neonGlow = prop(props, "glow", 0.8);
            item.effectsRequested = prop(props, "effects", true);

            if (!item.contentLayout.pulsarMeta)
                item.contentLayout.pulsarMeta = contentMeta();

            reconcile(item.contentLayout, node.children || [], false);
        } else if (node.type === "divider") {
            item.color = resolveColor(prop(props, "color", view.themeBorder), view.themeBorder);
            item.implicitHeight = 1;
        }

        applyBadge(item, props);
    }

    function countItems(item) {
        let total = 0;

        for (let i = 0; i < item.children.length; i++)
            total += 1 + countItems(item.children[i]);

        return total;
    }


    // Where the keyboard starts in window coordinates; Infinity while it is hidden.
    function keyboardTop() {
        const rect = Qt.inputMethod.keyboardRectangle;

        if (!Qt.inputMethod.visible || rect.height <= 0)
            return Infinity;

        // Android reports this rectangle in device pixels, the window is in logical ones.
        const scale = rect.y + rect.height > view.height + 1 ? view.screen.devicePixelRatio : 1;

        return rect.y / scale;
    }

    // How much of the bottom of a scroll view is under the keyboard.
    function keyboardCovered(flick) {
        if (flick.height <= 0)
            return 0;

        const covered = flick.mapToItem(null, 0, flick.height).y - view.keyboardTop();

        return covered > 0 ? Math.round(covered) : 0;
    }

    // Brings the span top..bottom (in scroll view coordinates) above the keyboard and inside the view.
    function revealSpan(flick, top, bottom, margin) {
        view.syncKeyboardInset(flick);

        const visibleHeight = flick.height - view.keyboardCovered(flick);

        if (top >= margin && bottom + margin <= visibleHeight)
            return;

        const maxY = Math.max(0, flick.contentHeight + flick.bottomMargin - flick.height);
        const target = top < margin
                ? flick.contentY + top - margin
                : flick.contentY + bottom + margin - visibleHeight;

        revealMotion.target = flick;
        revealMotion.to = Math.min(maxY, Math.max(0, target));
        revealMotion.restart();
    }

    // While the keyboard is up the page may be taller than the space above it: the window can grow
    // back for a moment when focus moves between fields. The part of a scroll view under the keyboard
    // becomes extra scroll room, so the content is neither clamped nor stuck below the keyboard.
    function syncKeyboardInset(flick) {
        const extra = flick.pulsarMeta ? flick.pulsarMeta.extra : null;

        if (!extra)
            return;

        if (extra.baseMargin === undefined)
            extra.baseMargin = flick.bottomMargin;

        const margin = extra.baseMargin + view.keyboardCovered(flick);

        if (flick.bottomMargin === margin)
            return;

        flick.bottomMargin = margin;
        view.keyboardFlicks[extra.scrollKey] = flick;
    }

    function releaseKeyboardInset() {
        for (const key in view.keyboardFlicks) {
            const flick = view.keyboardFlicks[key];

            flick.bottomMargin = flick.pulsarMeta.extra.baseMargin;
        }

        view.keyboardFlicks = ({});
    }

    function scrollAncestor(item) {
        let node = item ? item.parent : null;

        while (node && node !== view) {
            if (node.contentY !== undefined && node.contentHeight !== undefined)
                return node;

            node = node.parent;
        }

        return null;
    }

    function revealInput(item) {
        if (!item)
            return;

        const flick = scrollAncestor(item);

        if (!flick || flick.height <= 0 || flick.dragging)
            return;

        const top = item.mapToItem(flick, 0, 0).y;

        view.revealSpan(flick, top, top + item.height, 16);
    }

    // Dev control: where a node is on screen, so `pulsar hover` and `click` aim real input at it.
    // Content moving under a still pointer changes hover every frame, and each change runs state
    // updates and a cursor switch, so scrolling switches hover off until the list has stopped.
    property var hoverHandlers: []
    property int scrollingLists: 0

    Timer {
        id: hoverResume

        interval: 150
        onTriggered: view.setHoverEnabled(true)
    }

    function trackHover(handler) {
        view.hoverHandlers.push(handler);

        if (view.scrollingLists > 0)
            handler.enabled = false;
    }

    function setHoverEnabled(enabled) {
        view.hoverHandlers = view.hoverHandlers.filter(function (handler) {
            return handler !== null && handler !== undefined;
        });

        for (const handler of view.hoverHandlers)
            handler.enabled = enabled;
    }

    function noteScrolling(active) {
        view.scrollingLists += active ? 1 : -1;

        if (active) {
            hoverResume.stop();

            if (view.scrollingLists === 1)
                setHoverEnabled(false);

            return;
        }

        if (view.scrollingLists === 0)
            hoverResume.restart();
    }

    function nativeMount(node, parent, holdEnter) {
        view.building++;

        if (holdEnter)
            view.creatingNodes++;

        try {
            return createNode(node, parent, false);
        } finally {
            if (holdEnter)
                view.creatingNodes--;

            view.building--;
        }
    }

    function nativeEnter(item) {
        const node = item.pulsarMeta.node;

        if (!view.motionReady || !node.props.enter || !item.visible)
            return;

        item.pulsarMeta.extra.motion.playEnter(node.props.enter);
        logMotion("enter", node.path);
    }

    function nativeUpdate(item, node, shallow) {
        view.building++;
        view.patchShallow = shallow === true;

        try {
            updateNode(item, node, false);
        } finally {
            view.patchShallow = false;
            view.building--;
        }
    }

    function nativePatch(path, node, shallow) {
        const item = view.nodeItems[path];

        if (!item || item.pulsarMeta.type !== node.type)
            return false;

        nativeUpdate(item, node, shallow);

        return true;
    }

    function nativeShellContent(item) {
        const content = item.pulsarMeta.content;
        const extra = content.pulsarMeta.extra;

        extra.nativeContent = true;

        if (extra.filler)
            extra.filler.visible = false;

        return content;
    }

    function nativeForget(path) {
        const prefix = path + "/";

        for (const known in view.nodeItems) {
            if (known === path || known.indexOf(prefix) === 0)
                delete view.nodeItems[known];
        }
    }

    function nativeDiscard(item) {
        discardItem(item);

        return item.visible;
    }

    function applyScrollKey(item, props) {
        const extra = item.pulsarMeta.extra;
        const key = props.scrollKey;

        if (extra.hasScrollKey && key !== extra.lastScrollKey) {
            item.contentY = item.originY;
            view.scrollPositions[extra.scrollKey] = item.originY;
        }

        extra.hasScrollKey = key !== undefined;
        extra.lastScrollKey = key;
    }

    // Moves a Flickable through its Inertia, which stops a fling or wheel spring in progress first.
    function scrollItem(item, toEnd, position, animated) {
        if (!item || item.contentY === undefined)
            return false;

        for (let i = 0; i < item.children.length; i++) {
            const child = item.children[i];

            if (typeof child.scrollTo !== "function")
                continue;

            if (toEnd)
                child.scrollToEnd(animated);
            else
                child.scrollTo(position, animated);

            return true;
        }

        item.contentY = toEnd ? Math.max(item.originY, item.originY + item.contentHeight - item.height) : position;

        return true;
    }

    function nativeScrollTo(item, toEnd, position, animated) {
        if (!item || !item.pulsarMeta || (item.pulsarMeta.node.type !== "scroll" && item.pulsarMeta.node.type !== "list"))
            return false;

        return scrollItem(item, toEnd, position, animated);
    }

    function nativeScrollByController(controller, toEnd, position, animated) {
        let moved = false;

        for (const path in view.nodeItems) {
            const item = view.nodeItems[path];
            const node = item && item.pulsarMeta ? item.pulsarMeta.node : null;

            if (!node || prop(node.props, "scrollController", -1) !== controller)
                continue;

            moved = scrollItem(item, toEnd, position, animated) || moved;
        }

        return moved;
    }

    function nativeScroll(item, node) {
        if (item.pulsarMeta) {
            item.pulsarMeta.node = node;
        } else {
            item.pulsarMeta = { type: node.type, node: node, index: ({}), order: [], content: null, extra: ({}) };
            item.boundsBehavior = Qt.binding(function () {
                return prop(item.pulsarMeta.node.props, "overscroll", true)
                        && item.contentHeight > item.height
                        && item.contentY > item.originY + 1
                        ? Flickable.DragOverBounds
                        : Flickable.StopAtBounds;
            });

            setupScrollMemory(item, node);
        }

        item.maximumFlickVelocity = prop(node.props, "flick", true) === false ? 0 : 8000;
        applyScrollKey(item, node.props);
    }

    function nativeTransition() {
        if (view.transitionMode === "none") {
            view.nativeRenderer.commit();

            return false;
        }

        if (view.transitionMode === "snapshot") {
            host.grabToImage(function (result) {
                view.nativeRenderer.commit();
                playTransition(result);
            });

            return true;
        }

        host.opacity = 0;
        view.nativeRenderer.commit();
        fadeIn.restart();

        return false;
    }

    function nativeAfterTree(count, elapsed) {
        view.motionReady = count > 0;

        if (PulsarBridge.env("PULSAR_INSPECTOR") !== "") {
            view.inspectText = "nodes " + view.countItems(host)
                    + " · build " + elapsed + " ms\n"
                    + Math.round(view.width) + "x" + Math.round(view.height)
                    + " · dpr " + view.screen.devicePixelRatio
                    + " · font " + view.fontScale
                    + " · " + Qt.platform.os;
        }

        maybeTestClick();
    }

    function devItemRect(path) {
        const item = view.nodeItems[path] || (view.nativeRenderer ? view.nativeRenderer.itemAt(path) : null);

        if (!item || !item.visible || item.width <= 0 || item.height <= 0)
            return null;

        const point = item.mapToItem(null, 0, 0);

        return { x: point.x, y: point.y, width: item.width, height: item.height };
    }

    // A growing text area can push its cursor below the visible part of the page.
    function revealCursor(item) {
        const flick = scrollAncestor(item);

        if (!flick || flick.height <= 0 || flick.dragging)
            return;

        const rect = item.cursorRectangle;
        const top = item.mapToItem(flick, rect.x, rect.y).y;

        view.revealSpan(flick, top, top + rect.height, 24);
    }

    // The keyboard may cover a field that has just been focused.
    function nativeFieldFocus(item, focused) {
        if (focused) {
            view.revealTarget = item;
            view.revealTicks = 4;
            keyboardRevealTimer.restart();
            return;
        }

        if (view.revealTarget === item)
            view.revealTarget = null;
    }

    function revealFocusedInput() {
        if (!view.revealTarget)
            return;

        view.revealInput(view.revealTarget);
    }

    NumberAnimation {
        id: revealMotion

        property: "contentY"
        duration: 220
        easing.type: Easing.OutCubic
    }

    Timer {
        id: keyboardRevealTimer

        interval: 80
        repeat: true
        onTriggered: {
            view.revealFocusedInput();
            view.revealTicks--;

            if (view.revealTicks <= 0)
                stop();
        }
    }

    Timer {
        id: keyboardHideTimer

        interval: 150
        onTriggered: {
            if (Qt.inputMethod.visible)
                return;

            view.revealTarget = null;

            const focused = view.activeFocusItem;

            if (focused)
                focused.focus = false;
        }
    }

    Connections {
        target: Qt.inputMethod

        function onKeyboardRectangleChanged() {
            const flick = view.scrollAncestor(view.revealTarget);

            if (flick)
                view.syncKeyboardInset(flick);
        }

        function onVisibleChanged() {
            if (Qt.platform.os !== "android")
                return;

            if (Qt.inputMethod.visible) {
                view.revealTicks = 4;
                keyboardRevealTimer.restart();
                return;
            }

            view.releaseKeyboardInset();
            keyboardHideTimer.restart();
        }
    }

}
