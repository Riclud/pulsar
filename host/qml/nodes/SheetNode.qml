import QtQuick
import Pulsar.Native
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Effects

Item {
    id: sheetRoot

    required property Window view

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

        layer.enabled: view.effectsAvailable && pulsarElevation > 0
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

                Inertia {
                    renderer: sheetRoot.view
                    flick: sheetScroll
                }

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
