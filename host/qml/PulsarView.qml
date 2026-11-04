import QtQuick
import QtQuick.Controls
import QtQuick.Controls.Material
import QtQuick.Layouts
import QtQuick.Effects
import QtQuick.Shapes

ApplicationWindow {
    id: view

    visible: true
    color: windowTransparent ? "transparent" : themeBackground

    LayoutMirroring.enabled: themeData && themeData.direction === "rtl"
    LayoutMirroring.childrenInherit: true

    Material.theme: themeBackground.hsvValue < 0.5 ? Material.Dark : Material.Light
    Material.background: themeSurface
    Material.foreground: themeText
    Material.primary: themePrimary
    Material.accent: themePrimary
    property bool windowTransparent: false
    property var tree: []
    property var uiTree: []
    property var uiPatch: null
    property string treeShape: ""
    property bool treeGrabPending: false
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
    readonly property int themeRadius: Math.round((themePalette.radius !== undefined ? themePalette.radius : 17) * density)
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
    readonly property string fontFamily: themeData && themeData.fontFamily !== undefined ? themeData.fontFamily : "Paper Mono"
    readonly property bool embeddedHost: typeof PulsarEmbedded !== "undefined" && PulsarEmbedded
    property var revealTarget: null
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

    component FieldBackground: Item {
        id: fieldBackground

        property var control
        property Item floatLabel
        property color borderColor: "transparent"
        property color focusColor: "transparent"
        property int cornerRadius: 8

        readonly property real strokeWidth: control && control.activeFocus ? 2 : 1
        readonly property real inset: strokeWidth / 2
        readonly property real corner: Math.max(1, cornerRadius - inset)
        readonly property bool showBorder: control ? (control.outlined || control.activeFocus) : false
        readonly property bool labelFloating: floatLabel !== null && control !== null
                && control.placeholderText.length > 0
                && (control.length > 0 || control.activeFocus)
        readonly property real labelWidth: labelFloating
                ? Math.min(floatLabel.width, floatLabel.implicitWidth) * floatLabel.scale
                : 0
        readonly property real gapStart: labelFloating ? floatLabel.x - 3 : inset + corner
        readonly property real gapEnd: labelFloating ? floatLabel.x + labelWidth + 3 : inset + corner

        Rectangle {
            anchors.fill: parent
            color: fieldBackground.control ? fieldBackground.control.fieldColor : "transparent"
            radius: fieldBackground.cornerRadius
        }

        Shape {
            anchors.fill: parent
            visible: fieldBackground.showBorder
            antialiasing: true

            ShapePath {
                fillColor: "transparent"
                strokeColor: fieldBackground.control && fieldBackground.control.activeFocus
                        ? fieldBackground.focusColor
                        : fieldBackground.borderColor
                strokeWidth: fieldBackground.strokeWidth
                capStyle: ShapePath.FlatCap
                joinStyle: ShapePath.RoundJoin

                startX: fieldBackground.gapEnd
                startY: fieldBackground.inset

                PathLine {
                    x: fieldBackground.width - fieldBackground.inset - fieldBackground.corner
                    y: fieldBackground.inset
                }
                PathAngleArc {
                    centerX: fieldBackground.width - fieldBackground.inset - fieldBackground.corner
                    centerY: fieldBackground.inset + fieldBackground.corner
                    radiusX: fieldBackground.corner
                    radiusY: fieldBackground.corner
                    startAngle: -90
                    sweepAngle: 90
                }
                PathLine {
                    x: fieldBackground.width - fieldBackground.inset
                    y: fieldBackground.height - fieldBackground.inset - fieldBackground.corner
                }
                PathAngleArc {
                    centerX: fieldBackground.width - fieldBackground.inset - fieldBackground.corner
                    centerY: fieldBackground.height - fieldBackground.inset - fieldBackground.corner
                    radiusX: fieldBackground.corner
                    radiusY: fieldBackground.corner
                    startAngle: 0
                    sweepAngle: 90
                }
                PathLine {
                    x: fieldBackground.inset + fieldBackground.corner
                    y: fieldBackground.height - fieldBackground.inset
                }
                PathAngleArc {
                    centerX: fieldBackground.inset + fieldBackground.corner
                    centerY: fieldBackground.height - fieldBackground.inset - fieldBackground.corner
                    radiusX: fieldBackground.corner
                    radiusY: fieldBackground.corner
                    startAngle: 90
                    sweepAngle: 90
                }
                PathLine {
                    x: fieldBackground.inset
                    y: fieldBackground.inset + fieldBackground.corner
                }
                PathAngleArc {
                    centerX: fieldBackground.inset + fieldBackground.corner
                    centerY: fieldBackground.inset + fieldBackground.corner
                    radiusX: fieldBackground.corner
                    radiusY: fieldBackground.corner
                    startAngle: 180
                    sweepAngle: 90
                }
                PathLine {
                    x: fieldBackground.gapStart
                    y: fieldBackground.inset
                }
            }
        }
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
        return Qt.rgba(c.r, c.g, c.b, alpha);
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
            const shape = make("import QtQuick; Gradient {}", item);

            stops = [
                make("import QtQuick; GradientStop { position: 0 }", shape),
                make("import QtQuick; GradientStop { position: 1 }", shape)
            ];

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
        anchors.margins: view.themeSpacing
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

        PointHandler {
            id: motion

            readonly property Item host: parent
            property bool following: false
            property real offsetX: 0
            property real offsetY: 0
            property real zoomValue: 1
            property real pressScale: 1
            property real heightLimit: Number.POSITIVE_INFINITY
            property real fullHeight: 0
            property int duration: view.motionFast
            property int easingType: Easing.BezierSpline
            property var exitDone: null
            readonly property bool holding: active && !following
                    && Math.abs(point.scenePosition.x - point.scenePressPosition.x) < 12
                    && Math.abs(point.scenePosition.y - point.scenePressPosition.y) < 12
            readonly property real pressDuration: Math.min(duration, 120)

            readonly property Translate shift: Translate {
                x: motion.offsetX
                y: motion.offsetY

                Behavior on x {
                    enabled: !motion.following

                    NumberAnimation {
                        duration: motion.duration
                        easing.type: motion.easingType
                        easing.bezierCurve: view.motionCurve
                    }
                }

                Behavior on y {
                    enabled: !motion.following

                    NumberAnimation {
                        duration: motion.duration
                        easing.type: motion.easingType
                        easing.bezierCurve: view.motionCurve
                    }
                }
            }

            readonly property Scale zoom: Scale {
                readonly property real value: motion.zoomValue * (motion.holding ? motion.pressScale : 1)

                origin.x: motion.host ? motion.host.width / 2 : 0
                origin.y: motion.host ? motion.host.height / 2 : 0
                xScale: value
                yScale: value

                Behavior on xScale {
                    enabled: !motion.following

                    NumberAnimation {
                        duration: motion.pressDuration
                        easing.type: Easing.OutCubic
                    }
                }

                Behavior on yScale {
                    enabled: !motion.following

                    NumberAnimation {
                        duration: motion.pressDuration
                        easing.type: Easing.OutCubic
                    }
                }
            }

            readonly property SequentialAnimation enterAnimation: SequentialAnimation {
                onFinished: {
                    motion.following = false;
                    motion.heightLimit = Number.POSITIVE_INFINITY;
                    motion.host.clip = motion.host.pulsarMeta.extra.clip === true;
                }

                ParallelAnimation {
                    NumberAnimation {
                        id: enterHeight

                        target: motion
                        property: "heightLimit"
                        duration: motion.duration
                        easing.type: Easing.OutCubic
                    }

                    NumberAnimation {
                        target: motion
                        properties: "offsetX,offsetY"
                        to: 0
                        duration: motion.duration
                        easing.type: motion.easingType
                        easing.bezierCurve: view.motionCurve
                    }

                    NumberAnimation {
                        target: motion
                        property: "zoomValue"
                        to: 1
                        duration: motion.duration
                        easing.type: Easing.OutCubic
                    }

                    NumberAnimation {
                        id: enterFade

                        target: motion.host
                        property: "opacity"
                        duration: motion.duration
                        easing.type: Easing.OutCubic
                    }
                }
            }

            readonly property SequentialAnimation exitAnimation: SequentialAnimation {
                onFinished: {
                    const done = motion.exitDone;

                    motion.exitDone = null;
                    motion.following = false;
                    motion.host.clip = motion.host.pulsarMeta.extra.clip === true;

                    if (done)
                        done();
                }

                ParallelAnimation {
                    NumberAnimation {
                        id: exitX

                        target: motion
                        property: "offsetX"
                        duration: motion.duration
                        easing.type: Easing.OutCubic
                    }

                    NumberAnimation {
                        id: exitY

                        target: motion
                        property: "offsetY"
                        duration: motion.duration
                        easing.type: Easing.OutCubic
                    }

                    NumberAnimation {
                        id: exitZoom

                        target: motion
                        property: "zoomValue"
                        duration: motion.duration
                        easing.type: Easing.OutCubic
                    }

                    NumberAnimation {
                        id: exitFade

                        target: motion.host
                        property: "opacity"
                        duration: motion.duration
                        easing.type: Easing.OutCubic
                    }

                    NumberAnimation {
                        target: motion
                        property: "heightLimit"
                        to: 0
                        duration: motion.duration
                        easing.type: Easing.OutCubic
                    }
                }
            }

            target: null

            readonly property bool animating: enterAnimation.running || exitAnimation.running

            onHeightLimitChanged: {
                const limit = host.pulsarMeta.extra.maxHeight;

                host.Layout.maximumHeight = Math.min(heightLimit, limit !== undefined ? limit : Number.POSITIVE_INFINITY);
            }

            function configure(props) {
                const transition = props.transition || ({});
                const curve = transition.curve || "spring";

                pressScale = props.pressed && props.pressed.scale !== undefined ? props.pressed.scale : 1;
                duration = transition.duration !== undefined ? transition.duration : view.motionFast;
                easingType = curve === "linear" ? Easing.Linear
                        : curve === "ease" ? Easing.OutCubic
                        : Easing.BezierSpline;
            }

            function restingOpacity() {
                const props = host.pulsarMeta.node.props;

                return props.opacity !== undefined ? props.opacity : 1;
            }

            function playEnter(state) {
                const interrupted = exitAnimation.running || enterAnimation.running;

                exitAnimation.stop();
                enterAnimation.stop();
                exitDone = null;
                following = true;

                const limit = fullHeight > 0 ? fullHeight : (host.height > 0 ? host.height : host.implicitHeight);

                if (!interrupted) {
                    offsetX = state.x !== undefined ? state.x : 0;
                    offsetY = state.y !== undefined ? state.y : 0;
                    zoomValue = state.scale !== undefined ? state.scale : 1;
                    host.opacity = state.opacity !== undefined ? state.opacity : restingOpacity();
                    heightLimit = limit > 0 ? 0 : Number.POSITIVE_INFINITY;
                }

                enterFade.from = host.opacity;
                enterFade.to = restingOpacity();
                enterHeight.from = heightLimit;
                enterHeight.to = limit > 0 ? limit : Number.POSITIVE_INFINITY;
                host.clip = limit > 0 || host.pulsarMeta.extra.clip === true;

                enterAnimation.restart();
            }

            function playExit(state, done) {
                const interrupted = enterAnimation.running;

                enterAnimation.stop();
                exitDone = done;
                following = true;

                if (!interrupted)
                    fullHeight = host.height;

                exitX.to = state.x !== undefined ? state.x : offsetX;
                exitY.to = state.y !== undefined ? state.y : offsetY;
                exitZoom.to = state.scale !== undefined ? state.scale : zoomValue;
                exitFade.to = state.opacity !== undefined ? state.opacity : host.opacity;
                heightLimit = host.height;
                host.clip = true;

                exitAnimation.restart();
            }

            function settle() {
                following = true;
                offsetX = 0;
                offsetY = 0;
                zoomValue = 1;
                heightLimit = Number.POSITIVE_INFINITY;
                host.opacity = restingOpacity();
                following = false;
            }
        }
    }

    Component {
        id: dragComponent

        DragHandler {
            id: dragHandler

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
        id: flickableComponent

        Flickable {
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            maximumFlickVelocity: 5000
            flickDeceleration: 1200

            rebound: Transition {
                NumberAnimation {
                    properties: "x,y"
                    duration: view.motionNormal
                    easing.type: Easing.BezierSpline
                    easing.bezierCurve: view.motionCurve
                }
            }

            property var pulsarMeta: null
        }
    }

    Component {
        id: boxComponent

        Rectangle {
            id: boxShadowHost

            property var pulsarMeta: null
            property int pulsarElevation: 0
            property color pulsarShadowColor: "#000000"
            layer.enabled: boxShadowHost.pulsarElevation > 0
            layer.effect: MultiEffect {
                shadowEnabled: true
                autoPaddingEnabled: true
                shadowColor: boxShadowHost.pulsarShadowColor
                shadowBlur: Math.min(1, 0.2 + boxShadowHost.pulsarElevation * 0.15)
                shadowOpacity: Math.min(0.5, 0.12 + boxShadowHost.pulsarElevation * 0.04)
                shadowVerticalOffset: boxShadowHost.pulsarElevation * 2
            }
        }
    }

    Component {
        id: cardComponent

        Rectangle {
            id: cardShadowHost

            border.width: 1
            property var pulsarMeta: null
            property int pulsarElevation: 0
            property color pulsarShadowColor: "#000000"
            layer.enabled: cardShadowHost.pulsarElevation > 0
            layer.effect: MultiEffect {
                shadowEnabled: true
                autoPaddingEnabled: true
                shadowColor: cardShadowHost.pulsarShadowColor
                shadowBlur: Math.min(1, 0.2 + cardShadowHost.pulsarElevation * 0.15)
                shadowOpacity: Math.min(0.5, 0.12 + cardShadowHost.pulsarElevation * 0.04)
                shadowVerticalOffset: cardShadowHost.pulsarElevation * 2
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
                    font.family: view.iconFamily
                    font.pixelSize: view.fs(24)

                    contentItem: Label {
                        text: back.text
                        font: back.font
                        color: back.hovered ? view.themeText : view.themeTextSecondary
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }

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
                        font.pixelSize: view.fs(18)
                        font.bold: true
                    }

                    Label {
                        id: subtitleText

                        Layout.fillWidth: true
                        visible: text.length > 0
                        elide: Text.ElideRight
                        color: view.themeTextSecondary
                        font.pixelSize: view.fs(12)
                    }
                }

                RowLayout {
                    id: actions
                    property var pulsarMeta: null
                    spacing: 0
                }
            }

            Rectangle {
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                height: 1
                color: view.themeBorder
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

            radius: view.themeRadius
            color: view.themeSurfaceVariant

            Behavior on color {
                ColorAnimation {
                    duration: view.motionFast
                    easing.type: Easing.BezierSpline
                    easing.bezierCurve: view.motionCurve
                }
            }

            Rectangle {
                anchors.fill: parent
                radius: chipRoot.radius
                color: view.withAlpha(view.themeText, 0.06)
                visible: chipMouse.containsMouse
            }

            MouseArea {
                id: chipMouse

                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: view.emitNodeEvent(chipRoot.nodeData, "click")
            }

            RowLayout {
                id: chipRow

                anchors.fill: parent
                anchors.leftMargin: 12
                anchors.rightMargin: chipRemove.visible ? 4 : 12
                spacing: 2

                Label {
                    id: chipLabel

                    Layout.fillWidth: true
                    horizontalAlignment: chipRemove.visible ? Text.AlignLeft : Text.AlignHCenter
                    color: view.themeText
                    font.family: view.fontFamily
                    font.pixelSize: view.fs(13)
                }

                ToolButton {
                    id: chipRemove

                    text: "close"
                    visible: false
                    implicitWidth: 24
                    implicitHeight: 24
                    padding: 0
                    font.family: view.iconFamily
                    font.pixelSize: view.fs(16)

                    contentItem: Label {
                        text: chipRemove.text
                        font: chipRemove.font
                        color: chipRemove.hovered ? view.themeText : view.themeTextSecondary
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }

                    onClicked: view.emitNodeEvent(chipRoot.nodeData, "remove")
                }
            }
        }
    }

    Component {
        id: buttonComponent

        Button {
            id: buttonRoot

            property var pulsarMeta: null
            property var nodeData: null
            property string variant: "solid"
            property color fillColor: view.themePrimary
            property color labelColor: view.themeOnPrimary
            property int radius: view.themeRadius
            property string iconName: ""
            property string iconPosition: "left"
            property int pulsarElevation: 0
            property color pulsarShadowColor: view.themeShadow
            property bool colorAnimationReady: false

            Component.onCompleted: Qt.callLater(function () {
                buttonRoot.colorAnimationReady = true;
            })

            layer.enabled: buttonRoot.pulsarElevation > 0
            layer.effect: MultiEffect {
                shadowEnabled: true
                autoPaddingEnabled: true
                shadowColor: buttonRoot.pulsarShadowColor
                shadowBlur: Math.min(1, 0.2 + buttonRoot.pulsarElevation * 0.15)
                shadowOpacity: Math.min(0.5, 0.12 + buttonRoot.pulsarElevation * 0.04)
                shadowVerticalOffset: buttonRoot.pulsarElevation * 2
            }

            flat: true
            leftPadding: 16
            rightPadding: 16
            topPadding: 8
            bottomPadding: 8
            implicitHeight: 40
            opacity: enabled ? 1 : 0.45
            scale: down ? 0.98 : 1

            Behavior on scale {
                NumberAnimation {
                    duration: view.motionFast
                    easing.type: Easing.BezierSpline
                    easing.bezierCurve: view.motionCurve
                }
            }

            HoverHandler {
                cursorShape: Qt.PointingHandCursor
            }

            onDownChanged: {
                if (!down)
                    return;

                ripple.x = width / 2 - ripple.width / 2;
                ripple.y = height / 2 - ripple.height / 2;
                rippleAnim.restart();
            }

            ParallelAnimation {
                id: rippleAnim

                NumberAnimation {
                    target: ripple
                    property: "scale"
                    from: 0.2
                    to: 1
                    duration: view.motionNormal
                    easing.type: Easing.BezierSpline
                    easing.bezierCurve: view.motionCurve
                }

                SequentialAnimation {
                    PropertyAction {
                        target: ripple
                        property: "opacity"
                        value: 0.28
                    }

                    NumberAnimation {
                        target: ripple
                        property: "opacity"
                        to: 0
                        duration: view.motionSlow
                        easing.type: Easing.BezierSpline
                        easing.bezierCurve: view.motionCurve
                    }
                }
            }

            background: Rectangle {
                id: buttonBackground

                radius: buttonRoot.radius
                clip: true
                color: {
                    if (!buttonRoot.enabled)
                        return view.disabledColor(buttonRoot.fillColor);
                    if (buttonRoot.variant === "outline" || buttonRoot.variant === "ghost")
                        return buttonRoot.hovered ? view.withAlpha(buttonRoot.fillColor, 0.08) : "transparent";
                    if (buttonRoot.variant === "soft")
                        return view.withAlpha(buttonRoot.fillColor, buttonRoot.down ? 0.28 : buttonRoot.hovered ? 0.22 : 0.16);

                    return buttonRoot.down ? view.activeColor(buttonRoot.fillColor)
                            : buttonRoot.hovered ? view.hoverColor(buttonRoot.fillColor)
                            : buttonRoot.fillColor;
                }
                border.width: buttonRoot.variant === "outline" ? 1 : 0
                border.color: buttonRoot.fillColor

                Behavior on color {
                    enabled: buttonRoot.colorAnimationReady

                    ColorAnimation {
                        duration: view.motionFast
                        easing.type: Easing.BezierSpline
                        easing.bezierCurve: view.motionCurve
                    }
                }

                Rectangle {
                    id: ripple

                    width: buttonRoot.height * 1.8
                    height: width
                    radius: width / 2
                    color: view.withAlpha(buttonRoot.labelColor, 0.22)
                    opacity: 0
                    scale: 0.2
                }
            }

            contentItem: RowLayout {
                spacing: buttonRoot.text.length > 0 ? 6 : 0

                Item {
                    Layout.fillWidth: true
                    visible: buttonRoot.text.length === 0
                }

                Label {
                    visible: text.length > 0 && buttonRoot.iconPosition === "left"
                    text: buttonRoot.iconName
                    font.family: view.iconFamily
                    font.pixelSize: view.fs(18)
                    color: buttonRoot.labelColor
                }

                Label {
                    Layout.fillWidth: buttonRoot.text.length > 0
                    text: buttonRoot.text
                    color: buttonRoot.labelColor
                    font.family: view.fontFamily
                    font.pixelSize: buttonRoot.font.pixelSize
                    font.weight: buttonRoot.font.weight
                    horizontalAlignment: Text.AlignHCenter
                    elide: Text.ElideRight
                }

                Label {
                    visible: text.length > 0 && buttonRoot.iconPosition === "right"
                    text: buttonRoot.iconName
                    font.family: view.iconFamily
                    font.pixelSize: view.fs(18)
                    color: buttonRoot.labelColor
                }

                Item {
                    Layout.fillWidth: true
                    visible: buttonRoot.text.length === 0
                }
            }
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

        TextField {
            id: fieldRoot

            property var pulsarMeta: null
            property color fieldColor: view.themeSurfaceVariant
            property color fieldBorderColor: view.themeBorder
            property int fieldRadius: 8
            property bool outlined: false
            property Item floatingLabel: null

            color: view.themeText
            placeholderTextColor: view.themeTextSecondary
            selectionColor: view.themePrimary
            selectedTextColor: view.themeOnPrimary
            cursorDelegate: textCursorComponent
            font.family: view.fontFamily
            leftPadding: 12
            rightPadding: 12

            Component.onCompleted: floatingLabel = view.findFloatingLabel(fieldRoot)

            background: FieldBackground {
                control: fieldRoot
                floatLabel: fieldRoot.floatingLabel
                borderColor: fieldRoot.fieldBorderColor
                focusColor: view.themePrimary
                cornerRadius: fieldRoot.fieldRadius
            }
        }
    }

    Component {
        id: textAreaComponent

        TextArea {
            id: areaRoot

            property var pulsarMeta: null
            property color fieldColor: view.themeSurfaceVariant
            property color fieldBorderColor: view.themeBorder
            property int fieldRadius: 8
            property bool outlined: false
            property Item floatingLabel: null

            color: view.themeText
            placeholderTextColor: view.themeTextSecondary
            selectionColor: view.themePrimary
            selectedTextColor: view.themeOnPrimary
            cursorDelegate: textCursorComponent
            font.family: view.fontFamily
            leftPadding: 12
            rightPadding: 12
            topPadding: 8
            bottomPadding: 8
            wrapMode: TextEdit.Wrap

            Component.onCompleted: floatingLabel = view.findFloatingLabel(areaRoot)

            background: FieldBackground {
                control: areaRoot
                floatLabel: areaRoot.floatingLabel
                borderColor: areaRoot.fieldBorderColor
                focusColor: view.themePrimary
                cornerRadius: areaRoot.fieldRadius
            }
        }
    }

    Component {
        id: checkboxComponent

        CheckBox {
            id: checkboxRoot

            property var pulsarMeta: null

            padding: 0
            spacing: 8
            implicitHeight: Math.round(26 * view.density)

            indicator: Rectangle {
                implicitWidth: Math.round(20 * view.density)
                implicitHeight: Math.round(20 * view.density)
                radius: Math.round(6 * view.density)
                x: checkboxRoot.text
                        ? (checkboxRoot.mirrored ? checkboxRoot.width - width - checkboxRoot.rightPadding : checkboxRoot.leftPadding)
                        : checkboxRoot.leftPadding + (checkboxRoot.availableWidth - width) / 2
                y: checkboxRoot.topPadding + (checkboxRoot.availableHeight - height) / 2
                color: checkboxRoot.checked
                        ? view.themePrimary
                        : checkboxRoot.hovered
                            ? view.withAlpha(view.themePrimary, 0.16)
                            : "transparent"
                border.width: 1
                border.color: checkboxRoot.checked || checkboxRoot.hovered ? view.themePrimary : view.themeBorder

                Behavior on color {
                    ColorAnimation {
                        duration: view.motionFast
                    }
                }

                Text {
                    anchors.centerIn: parent
                    text: "check"
                    visible: checkboxRoot.checked
                    color: view.themeOnPrimary
                    font.family: view.iconFamily
                    font.pixelSize: Math.round(14 * view.density)
                    opacity: checkboxRoot.checked ? 1 : 0
                    scale: checkboxRoot.checked ? 1 : 0.7

                    Behavior on opacity {
                        NumberAnimation {
                            duration: view.motionFast
                        }
                    }

                    Behavior on scale {
                        NumberAnimation {
                            duration: view.motionFast
                            easing.type: Easing.BezierSpline
                            easing.bezierCurve: view.motionCurve
                        }
                    }
                }
            }

            contentItem: Label {
                leftPadding: checkboxRoot.indicator && !checkboxRoot.mirrored
                        ? checkboxRoot.indicator.width + checkboxRoot.spacing : 0
                rightPadding: checkboxRoot.indicator && checkboxRoot.mirrored
                        ? checkboxRoot.indicator.width + checkboxRoot.spacing : 0
                text: checkboxRoot.text
                font.family: view.fontFamily
                font.pixelSize: view.fs(15)
                color: view.themeText
                verticalAlignment: Text.AlignVCenter
            }
        }
    }

    Component {
        id: switchComponent

        Switch {
            id: switchRoot

            property var pulsarMeta: null

            padding: 0
            implicitHeight: 30

            indicator: Item {
                implicitWidth: 52
                implicitHeight: 28
                x: switchRoot.text
                        ? (switchRoot.mirrored ? switchRoot.width - width - switchRoot.rightPadding : switchRoot.leftPadding)
                        : switchRoot.leftPadding + (switchRoot.availableWidth - width) / 2
                y: switchRoot.topPadding + (switchRoot.availableHeight - height) / 2

                Rectangle {
                    id: switchTrack

                    anchors.fill: parent
                    radius: height / 2
                    color: switchRoot.checked ? view.themePrimary : view.themeSurfaceVariant
                    border.width: 1
                    border.color: switchRoot.checked ? view.themePrimary : view.themeBorder

                    Behavior on color {
                        ColorAnimation {
                            duration: view.motionFast
                            easing.type: Easing.BezierSpline
                            easing.bezierCurve: view.motionCurve
                        }
                    }
                }

                Rectangle {
                    id: switchThumb

                    y: (parent.height - height) / 2
                    width: switchRoot.pressed ? 24 : switchRoot.checked ? 20 : 14
                    height: width
                    radius: width / 2
                    x: switchRoot.checked ? parent.width - 24 : 4
                    color: switchRoot.checked ? view.themeOnPrimary : view.themeTextSecondary

                    Behavior on x {
                        NumberAnimation {
                            duration: view.motionFast
                            easing.type: Easing.BezierSpline
                            easing.bezierCurve: view.motionCurve
                        }
                    }

                    Behavior on width {
                        NumberAnimation {
                            duration: view.motionFast
                            easing.type: Easing.BezierSpline
                            easing.bezierCurve: view.motionCurve
                        }
                    }

                    Behavior on color {
                        ColorAnimation {
                            duration: view.motionFast
                        }
                    }
                }
            }

            contentItem: Label {
                leftPadding: switchRoot.indicator && !switchRoot.mirrored
                        ? switchRoot.indicator.width + switchRoot.spacing : 0
                rightPadding: switchRoot.indicator && switchRoot.mirrored
                        ? switchRoot.indicator.width + switchRoot.spacing : 0
                text: switchRoot.text
                font.family: view.fontFamily
                font.pixelSize: view.fs(15)
                color: view.themeText
                verticalAlignment: Text.AlignVCenter
            }
        }
    }

    Component {
        id: avatarComponent

        Item {
            id: avatarRoot

            property var pulsarMeta: null
            property string src: ""
            property string initials: "?"
            property int avatarSize: 40
            property int avatarRadius: 9999
            property color fallbackColor: view.themeSurfaceVariant
            property color fallbackTextColor: view.themeText
            property string status: ""
            property color statusColor: view.themePrimary

            width: avatarSize
            height: avatarSize
            implicitWidth: avatarSize
            implicitHeight: avatarSize

            onAvatarRadiusChanged: avatarCanvas.requestPaint()
            onSrcChanged: avatarCanvas.requestPaint()
            onAvatarSizeChanged: avatarCanvas.requestPaint()

            Rectangle {
                id: avatarFallback

                anchors.fill: parent
                radius: avatarRoot.avatarRadius
                color: avatarRoot.fallbackColor
                visible: avatarRoot.src.length === 0 || avatarImage.status === Image.Error

                Label {
                    anchors.centerIn: parent
                    text: avatarRoot.initials
                    color: avatarRoot.fallbackTextColor
                    font.family: view.fontFamily
                    font.pixelSize: view.fs(Math.max(10, avatarRoot.avatarSize * 0.36))
                    font.weight: 600
                }
            }

            Image {
                id: avatarImage

                anchors.fill: parent
                source: avatarRoot.src
                fillMode: Image.PreserveAspectCrop
                visible: false

                onStatusChanged: avatarCanvas.requestPaint()
            }

            Canvas {
                id: avatarCanvas

                anchors.fill: parent
                visible: avatarImage.status === Image.Ready

                onImageLoaded: requestPaint()
                onWidthChanged: requestPaint()
                onHeightChanged: requestPaint()

                onPaint: {
                    const ctx = getContext("2d");

                    if (avatarImage.status !== Image.Ready)
                        return;

                    const w = width;
                    const h = height;
                    const r = Math.min(avatarRoot.avatarRadius, Math.min(w, h) / 2);
                    const iw = avatarImage.sourceSize.width || avatarImage.implicitWidth || w;
                    const ih = avatarImage.sourceSize.height || avatarImage.implicitHeight || h;
                    const scale = Math.max(w / iw, h / ih);
                    const dw = iw * scale;
                    const dh = ih * scale;

                    ctx.clearRect(0, 0, w, h);
                    ctx.save();
                    avatarRoot.roundedPath(ctx, 0, 0, w, h, r);
                    ctx.clip();
                    ctx.drawImage(avatarRoot.src, (w - dw) / 2, (h - dh) / 2, dw, dh);
                    ctx.restore();
                }
            }

            function roundedPath(ctx, x, y, w, h, r) {
                ctx.beginPath();
                ctx.moveTo(x + r, y);
                ctx.lineTo(x + w - r, y);
                ctx.quadraticCurveTo(x + w, y, x + w, y + r);
                ctx.lineTo(x + w, y + h - r);
                ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                ctx.lineTo(x + r, y + h);
                ctx.quadraticCurveTo(x, y + h, x, y + h - r);
                ctx.lineTo(x, y + r);
                ctx.quadraticCurveTo(x, y, x + r, y);
                ctx.closePath();
            }

            Rectangle {
                visible: avatarRoot.status.length > 0
                width: Math.max(8, avatarRoot.avatarSize * 0.28)
                height: width
                radius: width / 2
                color: avatarRoot.statusColor
                border.width: 2
                border.color: view.themeBackground
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                anchors.rightMargin: -1
                anchors.bottomMargin: -1
            }
        }
    }

    Component {
        id: badgeComponent

        Rectangle {
            id: badgeRoot

            property var pulsarMeta: null
            property string label: ""
            property bool dot: false
            property color badgeColor: view.themePrimary
            property color badgeTextColor: view.themeOnPrimary

            implicitHeight: dot ? 8 : 18
            implicitWidth: dot ? 8 : Math.max(18, badgeLabel.implicitWidth + 10)
            height: implicitHeight
            width: implicitWidth
            radius: height / 2
            color: badgeColor

            Label {
                id: badgeLabel

                anchors.centerIn: parent
                text: badgeRoot.dot ? "" : badgeRoot.label
                visible: !badgeRoot.dot
                color: badgeRoot.badgeTextColor
                font.family: view.fontFamily
                font.pixelSize: view.fs(10)
                font.weight: 600
            }
        }
    }

    Component {
        id: skeletonComponent

        Rectangle {
            id: skeletonRoot

            property var pulsarMeta: null
            property string variant: "rect"
            property bool animated: true
            property int baseRadius: 8

            color: view.themeSurfaceVariant
            radius: variant === "circle" ? height / 2 : baseRadius

            SequentialAnimation on opacity {
                running: skeletonRoot.animated
                loops: Animation.Infinite

                NumberAnimation {
                    to: 0.45
                    duration: view.motionSlow
                    easing.type: Easing.InOutSine
                }

                NumberAnimation {
                    to: 1
                    duration: view.motionSlow
                    easing.type: Easing.InOutSine
                }
            }
        }
    }

    Component {
        id: spinnerComponent

        Item {
            id: spinnerRoot

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
            property bool isBottom: false
            property bool showHandle: true
            property real dragStart: 0
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

                property int pulsarElevation: 0
                property color pulsarShadowColor: view.themeShadow

                width: Math.min(parent.width - 24, 560)
                height: Math.min(parent.height - 48, 720)
                radius: view.themeRadius
                topLeftRadius: view.themeRadius
                topRightRadius: view.themeRadius
                bottomLeftRadius: sheetRoot.isBottom ? 0 : view.themeRadius
                bottomRightRadius: sheetRoot.isBottom ? 0 : view.themeRadius
                color: view.themeSurface
                border.width: 1
                border.color: view.themeBorder
                transformOrigin: Item.Center
                scale: sheetRoot.isBottom ? 1 : (sheetRoot.open ? 1 : 0.97)

                Behavior on scale {
                    NumberAnimation {
                        duration: view.motionFast
                        easing.type: Easing.BezierSpline
                        easing.bezierCurve: view.motionCurve
                    }
                }

                Behavior on y {
                    enabled: !sheetDrag.active
                    NumberAnimation {
                        duration: view.motionFast
                        easing.type: Easing.BezierSpline
                        easing.bezierCurve: view.motionCurve
                    }
                }

                layer.enabled: pulsarElevation > 0
                layer.effect: MultiEffect {
                    shadowEnabled: true
                    autoPaddingEnabled: true
                    shadowColor: sheetPanel.pulsarShadowColor
                    shadowBlur: Math.min(1, 0.2 + sheetPanel.pulsarElevation * 0.15)
                    shadowOpacity: Math.min(0.5, 0.12 + sheetPanel.pulsarElevation * 0.04)
                    shadowVerticalOffset: sheetPanel.pulsarElevation * 2
                }

                MouseArea {
                    anchors.fill: parent
                }

                Item {
                    id: sheetGrabber

                    anchors.top: parent.top
                    anchors.horizontalCenter: parent.horizontalCenter
                    width: 96
                    height: 24
                    visible: sheetRoot.isBottom && sheetRoot.showHandle

                    Rectangle {
                        anchors.centerIn: parent
                        width: 36
                        height: 4
                        radius: 2
                        color: view.themeBorder
                    }

                    DragHandler {
                        id: sheetDrag

                        target: null

                        yAxis.minimum: 0

                        onActiveChanged: {
                            if (active) {
                                sheetRoot.dragStart = sheetPanel.y;
                                return;
                            }

                            if (sheetPanel.y > sheetRoot.dragStart + 80) {
                                view.emitNodeEvent(sheetRoot.nodeData, "close");
                                return;
                            }

                            sheetPanel.y = sheetRoot.dragStart;
                        }

                        onActiveTranslationChanged: {
                            if (active)
                                sheetPanel.y = sheetRoot.dragStart + activeTranslation.y;
                        }
                    }
                }

                ColumnLayout {
                    anchors.fill: parent
                    spacing: 0

                    RowLayout {
                        Layout.fillWidth: true
                        Layout.leftMargin: 16
                        Layout.rightMargin: 4
                        Layout.topMargin: sheetRoot.isBottom ? 18 : 4
                        Layout.bottomMargin: 4
                        spacing: 4

                        Label {
                            id: sheetTitle

                            Layout.fillWidth: true
                            elide: Text.ElideRight
                            color: view.themeText
                            font.pixelSize: view.fs(18)
                            font.bold: true
                        }

                        ToolButton {
                            id: sheetClose

                            text: "close"
                            font.family: view.iconFamily
                            font.pixelSize: view.fs(24)

                            contentItem: Label {
                                text: sheetClose.text
                                font: sheetClose.font
                                color: sheetClose.hovered ? view.themeText : view.themeTextSecondary
                                horizontalAlignment: Text.AlignHCenter
                                verticalAlignment: Text.AlignVCenter
                            }

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

                background: Rectangle {
                    color: view.themeBackground
                }

                Repeater {
                    model: tabsRoot.tabItems

                    TabButton {
                        id: tabButton

                        text: modelData.label

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

            background: Rectangle {
                radius: view.themeRadius
                color: view.themeSurface
            }

            Repeater {
                model: segmentedRoot.tabItems

                TabButton {
                    id: segmentButton

                    text: modelData.label

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

            onCurrentIndexChanged: {
                if (segmentedRoot.syncing)
                    return;
                view.emitNodeEvent(segmentedRoot.nodeData, "change", currentIndex);
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

                layer.enabled: pulsarElevation > 0
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

        RadioButton {
            id: radioRoot

            property var pulsarMeta: null
            property var nodeData: null
            property color accent: view.themePrimary

            autoExclusive: false
            spacing: 10
            leftPadding: 0
            rightPadding: 0
            topPadding: 4
            bottomPadding: 4
            font.family: view.fontFamily
            font.pixelSize: view.fs(15)

            indicator: Item {
                implicitWidth: 22
                implicitHeight: 22

                Rectangle {
                    anchors.fill: parent
                    radius: width / 2
                    color: "transparent"
                    border.width: radioRoot.checked ? 0 : 1.5
                    border.color: radioRoot.checked ? radioRoot.accent
                            : radioRoot.hovered ? radioRoot.accent : view.themeBorder

                    Behavior on border.color {
                        ColorAnimation { duration: view.motionFast }
                    }
                }

                Rectangle {
                    anchors.centerIn: parent
                    width: radioRoot.checked ? 14 : 0
                    height: width
                    radius: width / 2
                    color: radioRoot.accent

                    Behavior on width {
                        NumberAnimation {
                            duration: view.motionFast
                            easing.type: Easing.OutCubic
                        }
                    }
                }
            }

            contentItem: Label {
                text: radioRoot.text
                color: radioRoot.enabled ? view.themeText : view.themeTextSecondary
                font: radioRoot.font
                verticalAlignment: Text.AlignVCenter
                leftPadding: radioRoot.indicator.width + radioRoot.spacing
            }
        }
    }

    Component {
        id: radioGroupComponent

        GridLayout {
            id: groupRoot

            property var pulsarMeta: null
            property var nodeData: null
            property var options: []
            property var value: undefined
            property bool horizontal: false
            property color accent: view.themePrimary

            columns: horizontal ? -1 : 1
            columnSpacing: 16
            rowSpacing: 4
            flow: GridLayout.LeftToRight

            function syncChecked() {
                for (let i = 0; i < groupRepeater.count; i++) {
                    const button = groupRepeater.itemAt(i);

                    if (button)
                        button.checked = groupRoot.value === button.modelData.value;
                }
            }

            onValueChanged: syncChecked()
            onOptionsChanged: syncChecked()
            Component.onCompleted: syncChecked()

            Repeater {
                id: groupRepeater

                model: groupRoot.options

                delegate: RadioButton {
                    id: optionRoot

                    required property var modelData
                    required property int index

                    autoExclusive: false
                    checked: false
                    text: modelData.label
                    spacing: 10
                    leftPadding: 0
                    rightPadding: 0
                    topPadding: 4
                    bottomPadding: 4
                    font.family: view.fontFamily
                    font.pixelSize: view.fs(15)
                    Layout.fillWidth: groupRoot.horizontal

                    onClicked: {
                        if (groupRoot.value === modelData.value)
                            return;

                        groupRoot.value = modelData.value;
                        groupRoot.syncChecked();
                        view.emitNodeEvent(groupRoot.nodeData, "change", modelData.value);
                    }

                    indicator: Item {
                        implicitWidth: 22
                        implicitHeight: 22

                        Rectangle {
                            anchors.fill: parent
                            radius: width / 2
                            color: "transparent"
                            border.width: optionRoot.checked ? 0 : 1.5
                            border.color: optionRoot.checked ? groupRoot.accent
                                    : optionRoot.hovered ? groupRoot.accent : view.themeBorder

                            Behavior on border.color {
                                ColorAnimation { duration: view.motionFast }
                            }
                        }

                        Rectangle {
                            anchors.centerIn: parent
                            width: optionRoot.checked ? 14 : 0
                            height: width
                            radius: width / 2
                            color: groupRoot.accent

                            Behavior on width {
                                NumberAnimation {
                                    duration: view.motionFast
                                    easing.type: Easing.OutCubic
                                }
                            }
                        }
                    }

                    contentItem: Label {
                        text: optionRoot.text
                        color: optionRoot.enabled ? view.themeText : view.themeTextSecondary
                        font: optionRoot.font
                        verticalAlignment: Text.AlignVCenter
                        leftPadding: optionRoot.indicator.width + optionRoot.spacing
                    }
                }
            }
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
                layer.enabled: pulsarElevation > 0

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

        Item {
            id: fabRoot

            property var pulsarMeta: null
            property var nodeData: null
            property string iconName: ""
            property int fabSize: 56
            property bool floating: true
            property bool fabEnabled: true
            property color fabColor: view.themePrimary
            property color fabTextColor: view.themeOnPrimary
            property int pulsarElevation: 0
            property color pulsarShadowColor: view.themeShadow

            implicitWidth: fabSize
            implicitHeight: fabSize
            width: fabSize
            height: fabSize
            opacity: fabEnabled ? 1 : 0.45
            layer.enabled: pulsarElevation > 0

            layer.effect: MultiEffect {
                shadowEnabled: true
                autoPaddingEnabled: true
                shadowColor: fabRoot.pulsarShadowColor
                shadowBlur: Math.min(1, 0.2 + fabRoot.pulsarElevation * 0.15)
                shadowOpacity: Math.min(0.5, 0.12 + fabRoot.pulsarElevation * 0.04)
                shadowVerticalOffset: fabRoot.pulsarElevation * 2
            }

            onFloatingChanged: updateAnchors()

            function updateAnchors() {
                if (floating) {
                    anchors.right = parent.right;
                    anchors.bottom = parent.bottom;
                    anchors.rightMargin = 24;
                    anchors.bottomMargin = 24;
                    return;
                }

                anchors.right = undefined;
                anchors.bottom = undefined;
            }

            Rectangle {
                id: fabCircle

                anchors.fill: parent
                radius: width / 2
                color: fabRoot.fabEnabled
                        ? (fabMouse.pressed ? view.activeColor(fabRoot.fabColor)
                           : fabMouse.containsMouse ? view.hoverColor(fabRoot.fabColor) : fabRoot.fabColor)
                        : view.disabledColor(fabRoot.fabColor)
                scale: fabMouse.pressed ? 0.94 : 1

                Behavior on color {
                    ColorAnimation {
                        duration: view.motionFast
                        easing.type: Easing.BezierSpline
                        easing.bezierCurve: view.motionCurve
                    }
                }

                Behavior on scale {
                    NumberAnimation {
                        duration: view.motionFast
                        easing.type: Easing.BezierSpline
                        easing.bezierCurve: view.motionCurve
                    }
                }

                Label {
                    anchors.centerIn: parent
                    text: fabRoot.iconName
                    font.family: view.iconFamily
                    font.pixelSize: view.fs(Math.round(fabRoot.fabSize * 0.43))
                    color: fabRoot.fabTextColor
                }

                MouseArea {
                    id: fabMouse

                    anchors.fill: parent
                    enabled: fabRoot.fabEnabled
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: view.emitNodeEvent(fabRoot.nodeData, "click")
                }
            }
        }
    }

    Component {
        id: searchFieldComponent

        TextField {
            id: searchRoot

            property var pulsarMeta: null
            property var nodeData: null
            property bool outlined: false
            property color fieldColor: view.themeSurfaceVariant
            property color fieldBorderColor: view.themeBorder
            property int fieldRadius: 8
            property int debounce: 0
            property string hint: ""
            property alias clearButton: searchClear
            property alias inputTimer: debounceTimer

            color: view.themeText
            placeholderText: ""
            placeholderTextColor: view.themeTextSecondary
            font.family: view.fontFamily
            font.pixelSize: view.fs(15)
            inputMethodHints: Qt.ImhNoPredictiveText
            leftPadding: 40
            rightPadding: searchClear.visible ? 40 : 12
            implicitHeight: 40

            background: Rectangle {
                color: searchRoot.fieldColor
                radius: searchRoot.fieldRadius
                border.width: searchRoot.activeFocus ? 2 : searchRoot.outlined ? 1 : 0
                border.color: searchRoot.activeFocus ? view.themePrimary : searchRoot.fieldBorderColor

                Behavior on border.width {
                    NumberAnimation { duration: view.motionFast }
                }
            }

            Label {
                anchors.left: parent.left
                anchors.leftMargin: 12
                anchors.verticalCenter: parent.verticalCenter
                text: "search"
                font.family: view.iconFamily
                font.pixelSize: view.fs(20)
                color: searchRoot.activeFocus ? view.themePrimary : view.themeTextSecondary
            }

            Label {
                anchors.left: parent.left
                anchors.leftMargin: 40
                anchors.verticalCenter: parent.verticalCenter
                width: Math.max(0, searchRoot.width - 52)
                text: searchRoot.hint
                visible: searchRoot.text.length === 0 && searchRoot.preeditText.length === 0
                elide: Text.ElideRight
                color: view.themeTextSecondary
                font.family: view.fontFamily
                font.pixelSize: view.fs(15)
            }

            ToolButton {
                id: searchClear

                anchors.right: parent.right
                anchors.rightMargin: 4
                anchors.verticalCenter: parent.verticalCenter
                width: 32
                height: 32
                visible: searchRoot.text.length > 0
                hoverEnabled: true

                HoverHandler {
                    cursorShape: Qt.PointingHandCursor
                }

                background: Rectangle {
                    radius: 16
                    color: searchClear.hovered ? view.withAlpha(view.themeText, 0.08) : "transparent"
                }

                contentItem: Label {
                    text: "close"
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                    font.family: view.iconFamily
                    font.pixelSize: view.fs(18)
                    color: view.themeTextSecondary
                }

                onClicked: {
                    searchRoot.text = "";
                    view.emitNodeEvent(searchRoot.nodeData, "clear");
                    view.emitNodeEvent(searchRoot.nodeData, "input", "");
                }
            }

            Timer {
                id: debounceTimer

                interval: Math.max(0, searchRoot.debounce)

                onTriggered: view.emitNodeEvent(searchRoot.nodeData, "input", searchRoot.text)
            }
        }
    }

    Component {
        id: rangeSliderComponent

        RangeSlider {
            id: rangeRoot

            property var pulsarMeta: null
            property var nodeData: null
            property bool expand: false

            implicitWidth: 200
            implicitHeight: 40
            snapMode: Slider.NoSnap

            palette.highlight: view.themePrimary
            palette.accent: view.themePrimary
            palette.windowText: view.themeText
            palette.text: view.themeText

            first.handle: Rectangle {
                x: rangeRoot.leftPadding + rangeRoot.first.visualPosition * (rangeRoot.availableWidth - width)
                y: rangeRoot.topPadding + (rangeRoot.availableHeight - height) / 2
                implicitWidth: 20
                implicitHeight: 20
                radius: 10
                color: view.themeSurface
                border.width: 2
                border.color: view.themePrimary
            }

            second.handle: Rectangle {
                x: rangeRoot.leftPadding + rangeRoot.second.visualPosition * (rangeRoot.availableWidth - width)
                y: rangeRoot.topPadding + (rangeRoot.availableHeight - height) / 2
                implicitWidth: 20
                implicitHeight: 20
                radius: 10
                color: view.themeSurface
                border.width: 2
                border.color: view.themePrimary
            }

            background: Rectangle {
                x: rangeRoot.leftPadding
                y: rangeRoot.topPadding + (rangeRoot.availableHeight - height) / 2
                implicitWidth: 200
                implicitHeight: 4
                width: rangeRoot.availableWidth
                height: implicitHeight
                radius: 2
                color: view.themeSurfaceVariant

                Rectangle {
                    x: rangeRoot.first.position * parent.width
                    width: rangeRoot.second.position * parent.width - rangeRoot.first.position * parent.width
                    height: parent.height
                    color: view.themePrimary
                }
            }
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
                reuseItems: true
                maximumFlickVelocity: 5000
                flickDeceleration: 1200
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

                        HoverHandler {
                            id: rowHover

                            cursorShape: Qt.PointingHandCursor
                        }

                        TapHandler {
                            onTapped: {
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
    }

    onThemeDataChanged: {
        if (uiTree.length > 0)
            Qt.callLater(rebuild);
    }

    onTreeChanged: {
        uiTree = tree || [];
        renderTree();
    }

    onUiPatchChanged: {
        if (uiPatch && uiPatch.patches)
            applyUiPatch(uiPatch.patches);
    }

    function renderTree() {
        errorText = "";

        if (treeGrabPending)
            return;

        const route = treeRouteSignature(uiTree);
        const signature = route !== null ? route : treeSignature(uiTree, 0);

        if (treeShape === "" || signature === treeShape) {
            treeShape = signature;
            rebuild();
            return;
        }

        treeShape = signature;

        if (view.transitionMode === "none") {
            rebuild();
            return;
        }

        if (view.transitionMode === "snapshot") {
            treeGrabPending = true;

            host.grabToImage(function (result) {
                treeGrabPending = false;
                rebuild();
                playTransition(result);
            });

            return;
        }

        playFade();
    }

    function replaceTreeBranch(nodes, path, node, shallow) {
        for (let index = 0; index < nodes.length; index++) {
            const current = nodes[index];

            if (current.path === path) {
                if (node.children === undefined && shallow && current.children !== undefined)
                    node.children = current.children;

                nodes[index] = node;
                return true;
            }

            if (current.children && path.indexOf(current.path + "/") === 0) {
                if (replaceTreeBranch(current.children, path, node, shallow))
                    return true;
            }
        }

        return false;
    }

    function applyUiPatch(patches) {
        if (!patches || patches.length === 0)
            return;

        const started = Date.now();

        view.uiStats = { created: 0, updated: 0, removed: 0, reordered: 0 };

        for (const patch of patches) {
            if (!patch || !patch.path || !patch.node) {
                renderTree();
                return;
            }

            if (!replaceTreeBranch(view.uiTree, patch.path, patch.node, patch.shallow === true)) {
                renderTree();
                return;
            }
        }

        const route = treeRouteSignature(view.uiTree);

        treeShape = route !== null ? route : treeSignature(view.uiTree, 0);

        for (const patch of patches) {
            const item = view.nodeItems[patch.path];

            if (!item || item.pulsarMeta.type !== patch.node.type) {
                renderTree();
                return;
            }

            view.uiStats.updated++;
            view.patchShallow = patch.shallow === true;

            try {
                updateNode(item, patch.node, false);
            } finally {
                view.patchShallow = false;
            }
        }

        const elapsed = Date.now() - started;

        if (PulsarBridge.env("PULSAR_DEBUG"))
            console.log("PulsarView patch " + patches.length
                    + " +" + view.uiStats.created
                    + " ~" + view.uiStats.updated
                    + " -" + view.uiStats.removed
                    + " reorder=" + view.uiStats.reordered
                    + " " + elapsed + "ms");
    }

    function treeRouteSignature(nodes) {
        const walk = function (list, level) {
            if (!list || level > 1)
                return null;

            for (let i = 0; i < list.length; i++) {
                const node = list[i];

                if (!node)
                    continue;

                const key = node.props ? node.props.key : undefined;

                if (key !== undefined)
                    return node.type + "@" + node.path;

                const nested = walk(node.children || [], level + 1);

                if (nested !== null)
                    return nested;
            }

            return null;
        };

        return walk(nodes, 0);
    }

    function treeSignature(nodes, depth) {
        const parts = [];
        const walk = function (list, level) {
            if (!list || level > 3)
                return;

            for (let i = 0; i < list.length; i++) {
                const node = list[i];

                if (!node)
                    continue;

                parts.push(node.type + "@" + node.path);
                walk(node.children || [], level + 1);
            }
        };

        walk(nodes, 0);

        return parts.join("|");
    }

    function playFade() {
        host.opacity = 0;
        rebuild();
        fadeIn.restart();
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

    function emitEvent(node, event, value) {
        if (!node)
            return;
        PulsarBridge.emit("ui-event", {
            target: typeof PulsarWindowLabel !== "undefined" ? PulsarWindowLabel : "main",
            path: node.path,
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

            used += Math.max(0, shown - 1) * layout.spacing;

            const available = horizontal ? layout.width : layout.height;

            return Math.max(0, (available - used) * flex / total);
        });

        if (horizontal)
            kid.Layout.preferredWidth = size;
        else
            kid.Layout.preferredHeight = size;
    }

    function applyFlex(layout, horizontal, edges) {
        const kids = [];

        let total = 0;

        for (let i = 0; i < layout.children.length; i++) {
            const kid = layout.children[i];
            const kidNode = kid.pulsarMeta ? kid.pulsarMeta.node : null;

            if (!kidNode)
                continue;

            kids.push(kid);

            const flex = kidNode.props.flex;

            kid.pulsarMeta.extra.flexed = flex !== undefined && flex > 0;

            if (kid.pulsarMeta.extra.flexed)
                total += flex;
        }

        if (total <= 0)
            return;

        for (const kid of kids) {
            if (kid.pulsarMeta.extra.flexed)
                bindFlexSize(kid, layout, kids, total, kid.pulsarMeta.node.props.flex, horizontal, edges);
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

        for (let i = 0; i < kids.length; i++) {
            if (kids[i].visible !== false)
                active.push(i);
        }

        const first = active.length > 0 ? active[0] : -1;
        const last = active.length > 0 ? active[active.length - 1] : -1;

        for (let i = 0; i < kids.length; i++) {
            const kid = kids[i];

            if (horizontal) {
                kid.Layout.topMargin = padding.top;
                kid.Layout.bottomMargin = padding.bottom;
                kid.Layout.leftMargin = i === first ? padding.left : 0;
                kid.Layout.rightMargin = i === last ? padding.right : 0;
                continue;
            }

            kid.Layout.leftMargin = padding.left;
            kid.Layout.rightMargin = padding.right;
            kid.Layout.topMargin = i === first ? padding.top : 0;
            kid.Layout.bottomMargin = i === last ? padding.bottom : 0;
        }
    }

    function discardItem(item) {
        if (!item)
            return;

        const node = item.pulsarMeta ? item.pulsarMeta.node : null;

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

        if (!extra.motion && !props.pressed && !props.enter && !props.exit && !props.drag)
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

    function applyPendingScroll(list) {
        const extra = list.pulsarMeta.extra;
        const pending = extra.pendingScroll;

        if (pending === undefined)
            return;

        extra.restoringScroll = true;
        list.contentY = Math.min(pending, Math.max(0, list.contentHeight - list.height));
        extra.restoringScroll = false;
    }

    function setupScrollMemory(item, node) {
        const extra = item.pulsarMeta.extra;

        extra.scrollKey = node.path;
        extra.pendingScroll = view.scrollPositions[node.path];

        item.contentYChanged.connect(function () {
            if (extra.restoringScroll)
                return;

            extra.pendingScroll = undefined;
            view.scrollPositions[extra.scrollKey] = item.contentY;
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
        if (state.selectionStart !== undefined && item.selectionStart !== undefined)
            item.selectionStart = state.selectionStart;
        if (state.selectionEnd !== undefined && item.selectionEnd !== undefined)
            item.selectionEnd = state.selectionEnd;
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

        for (const item of direct) {
            item.parent = null;
            item.parent = parent;
        }

        restoreScrolls(scrolls);

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

    function createNode(node, parent, isRoot) {
        let item = null;

        if (node.type === "column") {
            item = columnComponent.createObject(parent);
        } else if (node.type === "row") {
            item = rowComponent.createObject(parent);
        } else if (node.type === "wrap" || node.type === "stack") {
            item = itemComponent.createObject(parent);
        } else if (node.type === "box") {
            item = boxComponent.createObject(parent);
        } else if (node.type === "scroll" || node.type === "list") {
            item = flickableComponent.createObject(parent);
        } else if (node.type === "grid") {
            item = gridComponent.createObject(parent);
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
            item.textChanged.connect(function () {
                if (item.pulsarMeta.syncing === true)
                    return;
                if (hasEvent(item.pulsarMeta.node, "input"))
                    emitEvent(item.pulsarMeta.node, "input", item.text);
            });
            item.activeFocusChanged.connect(function () {
                if (item.activeFocus) {
                    view.revealTarget = item;
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
            item.toggled.connect(function (value) {
                if (item.pulsarMeta.syncing === true)
                    return;
                if (hasEvent(item.pulsarMeta.node, "toggle"))
                    emitEvent(item.pulsarMeta.node, "toggle", value);
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
            item.textEdited.connect(function () {
                if (item.pulsarMeta.syncing === true)
                    return;
                if (item.debounce > 0) {
                    item.inputTimer.restart();
                    return;
                }
                if (hasEvent(item.pulsarMeta.node, "input"))
                    emitEvent(item.pulsarMeta.node, "input", item.text);
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
                if (clickableSurface && hasEvent(item.pulsarMeta.node, "click"))
                    emitEvent(item.pulsarMeta.node, "click");
            });

            press.longPressed.connect(function () {
                if (hasEvent(item.pulsarMeta.node, "longPress"))
                    emitEvent(item.pulsarMeta.node, "longPress");
            });

            if (clickableSurface) {
                const hover = make("import QtQuick; HoverHandler { cursorShape: Qt.PointingHandCursor }", item);
            }
        }
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

    function applyHover(item, props, base) {
        const hover = prop(props, "hoverColor", undefined);
        const extra = item.pulsarMeta.extra;

        if (hover === undefined) {
            if (extra.hoverBound === true)
                item.color = base;

            extra.hoverBound = false;

            return;
        }

        let handler = extra.hover;

        if (!handler) {
            handler = make("import QtQuick; HoverHandler {}", item);
            handler.cursorShape = Qt.PointingHandCursor;
            extra.hover = handler;
        }

        extra.hoverBound = true;
        item.color = Qt.binding(function () {
            const node = item.pulsarMeta.node;

            if (!node)
                return base;

            const fallback = node.type === "card" ? view.themeSurface : "transparent";
            const currentBase = resolveColor(prop(node.props, "color", fallback), fallback);
            const currentHover = prop(node.props, "hoverColor", undefined);

            if (currentHover === undefined)
                return currentBase;

            return handler.hovered ? resolveColor(currentHover, currentBase) : currentBase;
        });
    }

    function emitLayout(item) {
        if (!item || !item.pulsarMeta)
            return;
        if (!hasEvent(item.pulsarMeta.node, "layout"))
            return;
        if (item.width < 0 || item.height < 0)
            return;

        const extra = item.pulsarMeta.extra;

        if (extra.lastLayoutWidth === item.width && extra.lastLayoutHeight === item.height)
            return;

        extra.lastLayoutWidth = item.width;
        extra.lastLayoutHeight = item.height;
        emitEvent(item.pulsarMeta.node, "layout", { width: item.width, height: item.height });
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
        scheduleLayout(item);
    }

    function emitFocus(item, focused) {
        if (!item || !item.pulsarMeta)
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

    function applyCommon(item, node, isRoot) {
        watchLayout(item, node);
        watchFocus(item, node);

        const props = node.props;
        const defaultFillWidth = node.type === "card" || node.type === "list" || node.type === "scroll"
                || node.type === "wrap" || node.type === "grid" || node.type === "virtualList"
                || node.type === "appBar" || node.type === "divider" || node.type === "textInput"
                || node.type === "textArea" || node.type === "pager" || node.type === "tabs"
                || node.type === "navRail" || node.type === "segmented"
                || node.type === "accordion" || node.type === "accordionSection"
                || node.type === "radioGroup" || node.type === "searchField"
                || node.type === "rangeSlider" || node.type === "navBar";
        const fill = prop(props, "fill", undefined);
        let fillWidth = defaultFillWidth;
        let fillHeight = node.type === "list" || node.type === "scroll" || node.type === "grid"
                || node.type === "virtualList" || node.type === "pager" || node.type === "tabs"
                || node.type === "navRail";

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

        item.Layout.fillWidth = fillWidth;
        item.Layout.fillHeight = fillHeight;

        if (props.alignItems !== undefined && fillWidth && props.maxWidth === undefined)
            item.Layout.maximumWidth = Number.POSITIVE_INFINITY;

        if (props.alignItems !== undefined && fillHeight && props.maxHeight === undefined)
            item.Layout.maximumHeight = Number.POSITIVE_INFINITY;

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
            item.spacing = prop(props, "gap", 0);
            reconcile(item, node.children || [], false);
            applyPadding(item, paddingEdges(props, 0), node.type === "row");
            applyCrossAlign(item, props.alignItems, node.type === "row");
            applyFlex(item, node.type === "row", paddingEdges(props, 0));
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
        } else if (node.type === "box") {
            item.color = resolveColor(prop(props, "color", "transparent"), "transparent");
            applyHover(item, props, item.color);
            item.radius = prop(props, "radius", 0);
            item.border.width = prop(props, "borderWidth", 0);
            item.border.color = resolveColor(prop(props, "borderColor", view.themeBorder), view.themeBorder);
            applyGradient(item, prop(props, "gradient", null));

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
        } else if (node.type === "scroll" || node.type === "list") {
            item.maximumFlickVelocity = (prop(props, "flick", true) === false)
                    ? 0
                    : prop(props, "flickVelocity", 5000);
            item.flickDeceleration = prop(props, "flickDeceleration", 1200);
            item.boundsBehavior = prop(props, "overscroll", false)
                    ? Flickable.DragAndOvershootBounds
                    : Flickable.StopAtBounds;

            watchScroll(item, node);

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
            applyHover(item, props, item.color);
            item.radius = prop(props, "radius", view.themeRadius);
            item.border.width = prop(props, "borderWidth", 1);
            item.border.color = resolveColor(prop(props, "borderColor", view.themeBorder), view.themeBorder);
            applyGradient(item, prop(props, "gradient", null));

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
        } else if (node.type === "qml") {
            item.nodeData = node;

            const source = prop(props, "source", "");
            const base = PulsarBridge.env("PULSAR_APP") || "";
            const url = source.length === 0 ? ""
                    : /^[a-z][a-z0-9+.-]*:/i.test(source) ? source
                    : "file://" + (source.charAt(0) === "/" ? source : base + "/" + source);

            if (item.source !== url) {
                if (url.length === 0) {
                    item.source = "";
                } else {
                    item.setSource(url, prop(props, "props", {}));
                }
            }

            applyQmlProps(item, node);
        } else if (node.type === "text" || node.type === "selectableText") {
            const wrap = prop(props, "wrap", false);
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
            item.color = resolveColor(prop(props, "textColor", view.themeText), view.themeText);
            item.placeholderTextColor = view.themeTextSecondary;

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

            if (item.text !== searchValue) {
                item.pulsarMeta.syncing = true;
                item.text = searchValue;
                item.pulsarMeta.syncing = false;
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

    function rebuild() {
        if (!host.pulsarMeta)
            host.pulsarMeta = contentMeta();

        const started = Date.now();
        const focus = captureFocus();

        view.uiStats = { created: 0, updated: 0, removed: 0, reordered: 0 };
        reconcile(host, view.uiTree || [], true);
        restoreFocus(focus);

        view.motionReady = (view.uiTree || []).length > 0;

        const elapsed = Date.now() - started;

        if (PulsarBridge.env("PULSAR_DEBUG"))
            console.log("PulsarView built " + host.children.length
                    + " +" + view.uiStats.created
                    + " ~" + view.uiStats.updated
                    + " -" + view.uiStats.removed
                    + " reorder=" + view.uiStats.reordered
                    + " " + elapsed + "ms");

        if (PulsarBridge.env("PULSAR_INSPECTOR") !== "") {
            view.inspectText = "nodes " + view.countItems(host)
                    + " · build " + elapsed + " ms"
                    + " · +" + view.uiStats.created
                    + " ~" + view.uiStats.updated
                    + " -" + view.uiStats.removed
                    + " ↕" + view.uiStats.reordered + "\n"
                    + Math.round(view.width) + "x" + Math.round(view.height)
                    + " · dpr " + view.screen.devicePixelRatio
                    + " · font " + view.fontScale
                    + " · " + Qt.platform.os;
        }

        maybeTestClick();
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

        if (!flick || flick.height <= 0)
            return;

        const top = item.mapToItem(flick, 0, 0).y;
        const bottom = top + item.height;
        const margin = 16;

        if (top >= margin && bottom + margin <= flick.height)
            return;

        const maxY = Math.max(0, flick.contentHeight - flick.height);
        const target = top < margin
                ? flick.contentY + top - margin
                : flick.contentY + bottom + margin - flick.height;

        flick.contentY = Math.min(maxY, Math.max(0, target));
    }

    function revealFocusedInput() {
        if (!view.revealTarget)
            return;

        view.revealInput(view.revealTarget);
    }

    Timer {
        id: keyboardRevealTimer

        interval: 220
        onTriggered: view.revealFocusedInput()
    }

    Connections {
        target: Qt.inputMethod

        function onVisibleChanged() {
            if (Qt.platform.os !== "android")
                return;

            if (Qt.inputMethod.visible) {
                keyboardRevealTimer.restart();
                return;
            }

            view.revealTarget = null;

            const focused = view.activeFocusItem;

            if (focused)
                focused.focus = false;
        }
    }

}
