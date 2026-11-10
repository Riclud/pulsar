import QtQuick
import QtQuick.Controls

Item {
    id: avatarRoot

    required property Window view
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
