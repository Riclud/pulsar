import QtQuick
import QtQuick.Controls
import QtMultimedia

Window {
    id: player

    property url source
    property bool controlsVisible: true

    width: 960
    height: 540
    minimumWidth: 320
    minimumHeight: 200
    color: "#000000"
    title: "Video"
    visible: true

    function open(url) {
        source = url;
        media.play();
        showControls();
    }

    function togglePlayback() {
        if (media.playbackState === MediaPlayer.PlayingState)
            media.pause();
        else
            media.play();
    }

    function showControls() {
        controlsVisible = true;
        controlsTimer.restart();
    }

    function clock(ms) {
        const total = Math.floor((isFinite(ms) && ms > 0 ? ms : 0) / 1000);
        const minutes = Math.floor(total / 60);
        const seconds = total % 60;

        return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
    }

    onClosing: media.stop()

    Shortcut {
        sequences: ["Space"]
        onActivated: player.togglePlayback()
    }

    Shortcut {
        sequence: "Escape"
        onActivated: player.close()
    }

    MediaPlayer {
        id: media

        source: player.source
        audioOutput: AudioOutput {}

        onPlaybackStateChanged: player.showControls()
        onErrorStringChanged: {
            if (errorString.length > 0)
                player.title = "Video — " + errorString;
        }
    }

    Item {
        anchors.fill: parent

        VideoOutput {
            anchors.fill: parent
            fillMode: VideoOutput.PreserveAspectFit
        }

        MouseArea {
            anchors.fill: parent
            hoverEnabled: true

            onClicked: player.togglePlayback()
            onPositionChanged: player.showControls()
        }

        Rectangle {
            anchors.top: parent.top
            anchors.right: parent.right
            anchors.margins: 12
            width: 44
            height: 44
            radius: 22
            color: "#88000000"
            visible: player.controlsVisible

            ToolButton {
                anchors.fill: parent
                text: "close"
                font.family: iconFont.name
                font.pixelSize: 22
                palette.buttonText: "#ffffff"
                onClicked: player.close()
            }
        }

        Rectangle {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            height: 56
            color: "#99000000"
            visible: player.controlsVisible

            Row {
                anchors.fill: parent
                anchors.leftMargin: 12
                anchors.rightMargin: 12
                spacing: 12

                ToolButton {
                    anchors.verticalCenter: parent.verticalCenter
                    text: media.playbackState === MediaPlayer.PlayingState ? "pause" : "play_arrow"
                    font.family: iconFont.name
                    font.pixelSize: 26
                    palette.buttonText: "#ffffff"
                    onClicked: player.togglePlayback()
                }

                Slider {
                    id: seek

                    width: parent.width - 150
                    anchors.verticalCenter: parent.verticalCenter
                    from: 0
                    to: Math.max(1, media.duration)
                    value: media.position
                    onMoved: media.setPosition(value)
                }

                Label {
                    anchors.verticalCenter: parent.verticalCenter
                    color: "#ffffff"
                    text: player.clock(media.position) + " / " + player.clock(media.duration)
                }
            }
        }
    }

    FontLoader {
        id: iconFont

        source: "qrc:/runtime/fonts/MaterialIcons.ttf"
    }

    Timer {
        id: controlsTimer

        interval: 2500
        onTriggered: player.controlsVisible = false
    }
}
