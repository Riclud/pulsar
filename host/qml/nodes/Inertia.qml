import QtQuick

MouseArea {
    id: inertia

    required property Window renderer
    readonly property Window view: renderer
    required property Flickable flick
    property bool stretch: false
    property var samples: []
    property real startY: 0
    property real distance: 0
    property real duration: 0
    property real impulse: 0
    property int edge: 0

    readonly property real pull: Math.abs(flick.verticalOvershoot) + impulse
    readonly property bool pullsTop: flick.verticalOvershoot < 0 || (flick.verticalOvershoot === 0 && edge < 0)

    parent: flick
    anchors.fill: parent
    z: 1
    visible: frames.running || wheeling.running || pressed

    readonly property bool scrolling: frames.running || wheeling.running || flick.moving

    onScrollingChanged: view.noteScrolling(scrolling)
    Component.onDestruction: {
        if (scrolling)
            view.noteScrolling(false);
    }

    onPressed: {
        frames.stop()
        wheeling.stop()
    }

    function minY() {
        return flick.originY - flick.topMargin;
    }

    function maxY() {
        return Math.max(minY(), flick.originY + flick.contentHeight + flick.bottomMargin - flick.height);
    }

    function addSample() {
        const now = Date.now();
        const kept = samples.filter(function (sample) {
            return now - sample.time <= 100;
        });

        kept.push({ time: now, y: flick.contentY });
        samples = kept;
    }

    function releaseVelocity() {
        const now = Date.now();
        const recent = samples.filter(function (sample) {
            return now - sample.time <= 100;
        });

        if (recent.length < 2)
            return 0;

        let meanTime = 0;
        let meanY = 0;

        for (const sample of recent) {
            meanTime += sample.time / recent.length;
            meanY += sample.y / recent.length;
        }

        let covariance = 0;
        let variance = 0;

        for (const sample of recent) {
            covariance += (sample.time - meanTime) * (sample.y - meanY);
            variance += (sample.time - meanTime) * (sample.time - meanTime);
        }

        if (variance === 0)
            return 0;

        return 1000 * covariance / variance;
    }

    function curveAt(time) {
        const curve = view.flingCurve;
        const position = time * (curve.length - 1);
        const index = Math.min(curve.length - 2, Math.floor(position));

        return curve[index] + (curve[index + 1] - curve[index]) * (position - index);
    }

    function fling(velocity) {
        const limit = flick.maximumFlickVelocity;
        const speed = Math.min(Math.abs(velocity), limit);

        if (speed < 50)
            return;

        const friction = 0.015 * 9.80665 * 39.37 * 160 * 0.84;
        const deceleration = 2.358;
        const base = Math.log(0.35 * speed / friction);

        startY = flick.contentY;
        duration = Math.exp(base / (deceleration - 1));
        distance = (velocity < 0 ? -1 : 1) * friction * Math.exp(deceleration / (deceleration - 1) * base);
        view.logMotion("fling " + Math.round(velocity) + " " + Math.round(distance) + " " + duration.toFixed(2), "");
        frames.restart();
    }

    function scrollByWheel(event) {
        if (flick.contentHeight <= flick.height) {
            event.accepted = false;
            return;
        }

        frames.stop();

        const touchpad = event.pixelDelta.y !== 0;
        const distance = touchpad ? -event.pixelDelta.y : -event.angleDelta.y;
        const base = wheeling.running ? wheeling.target : flick.contentY;

        if (!wheeling.running)
            wheeling.velocity = 0;

        // Both the wheel and the touchpad move a target, and a critically damped spring
        // follows it: velocity stays continuous, so a new tick cannot kick the motion.
        wheeling.target = Math.max(minY(), Math.min(maxY(), base + distance));
        wheeling.stiffness = touchpad ? 60 : 30;
        wheeling.start();
    }

    function absorb(velocity) {
        if (!stretch || velocity < 0 || flick.boundsBehavior === Flickable.StopAtBounds)
            return;

        edge = 1;
        absorbPeak.to = Math.min(320, Math.abs(velocity) * 0.06);
        absorbing.restart();
    }

    function step(elapsed) {
        const time = elapsed / duration;
        const done = time >= 1;
        const next = startY + distance * (done ? 1 : curveAt(time));
        const low = minY();
        const high = maxY();

        if (next >= low && next <= high) {
            flick.contentY = next;

            if (done)
                frames.stop();

            return;
        }

        const ahead = Math.min(1, time + 0.01);
        const velocity = distance * (curveAt(ahead) - curveAt(time)) / (Math.max(0.0001, ahead - time) * duration);

        flick.contentY = next < low ? low : high;
        frames.stop();
        absorb(velocity);
    }

    MouseArea {
        parent: inertia.flick
        anchors.fill: parent
        acceptedButtons: Qt.NoButton
        z: 1

        onWheel: function (event) {
            inertia.scrollByWheel(event);
        }
    }

    FrameAnimation {
        id: wheeling

        property real target: 0
        property real velocity: 0
        property real stiffness: 30

        onTriggered: {
            // The exact solution of the spring, so the result does not depend on frame length.
            const elapsed = Math.max(frameTime, 0.001);
            const offset = inertia.flick.contentY - target;
            const decay = Math.exp(-stiffness * elapsed);
            const carry = (velocity + stiffness * offset) * elapsed;
            const nextOffset = (offset + carry) * decay;

            velocity = (velocity - stiffness * carry) * decay;

            if (Math.abs(nextOffset) < 0.5 && Math.abs(velocity) < 20) {
                inertia.flick.contentY = target;
                stop();
                return;
            }

            inertia.flick.contentY = Math.max(inertia.minY(), Math.min(inertia.maxY(), target + nextOffset));
        }
    }

    FrameAnimation {
        id: frames

        onTriggered: inertia.step(elapsedTime)
    }

    SequentialAnimation {
        id: absorbing

        NumberAnimation {
            id: absorbPeak

            target: inertia
            property: "impulse"
            duration: 90
            easing.type: Easing.OutQuad
        }

        NumberAnimation {
            target: inertia
            property: "impulse"
            to: 0
            duration: 420
            easing.type: Easing.OutCubic
        }
    }

    Scale {
        id: stretchScale

        yScale: 1 + 0.1 * (1 - Math.exp(-inertia.pull / (Math.max(1, inertia.flick.height) * 0.4)))
        origin.y: inertia.pullsTop
                ? inertia.flick.originY
                : inertia.flick.originY + inertia.flick.contentHeight
    }

    Translate {
        id: stretchShift

        y: inertia.flick.verticalOvershoot
    }

    Connections {
        target: inertia.flick

        function onContentYChanged() {
            if (inertia.flick.draggingVertically)
                inertia.addSample();
        }

        function onDraggingVerticallyChanged() {
            if (!inertia.flick.draggingVertically)
                return;

            inertia.samples = [];
            wheeling.stop();
            view.revealMotion.stop();
            frames.stop();
            absorbing.stop();
            inertia.impulse = 0;
        }

        function onFlickStarted() {
            const velocity = inertia.releaseVelocity();

            if (velocity === 0 || inertia.flick.verticalOvershoot !== 0)
                return;

            inertia.flick.cancelFlick();
            inertia.fling(velocity);
        }
    }

    Component.onCompleted: {
        if (stretch)
            flick.contentItem.transform = [stretchScale, stretchShift];
    }
}
