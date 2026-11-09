import QtQuick
import QtQuick.Layouts

PointHandler {
    id: motion

    required property Window view

    objectName: "pulsarMotion"

    readonly property Item host: parent
    property bool following: false
    property real offsetX: 0
    property real offsetY: 0
    property real zoomValue: 1
    property real stateScale: 1
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
        readonly property real value: motion.zoomValue * motion.stateScale

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

            view.scheduleGaps(motion.host.parent);
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

    onHoldingChanged: view.refreshStates(host)

    onHeightLimitChanged: {
        const limit = host.pulsarMeta.extra.maxHeight;

        host.Layout.maximumHeight = Math.min(heightLimit, limit !== undefined ? limit : Number.POSITIVE_INFINITY);
        view.scheduleGaps(host.parent);
    }

    function configure(props) {
        const transition = props.transition || ({});
        const curve = transition.curve || "spring";

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
