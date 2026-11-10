import QtQuick
import QtMultimedia

// The Video node. It lives apart from nodes/ because it needs QtMultimedia, which not every build ships:
// PulsarView loads it on first use and falls back to an empty item when it is missing.
Item {
    id: videoRoot

    property var view: null
    property var pulsarMeta: null
    property var nodeData: null
    property url source
    property bool muted: false
    property bool loop: false
    property bool autoplay: false
    // true pauses, false plays, undefined leaves it to autoplay.
    property var paused: undefined
    property string fillMode: "contain"
    property real volume: 1
    property bool ended: false
    property bool released: false

    function log(text) {
        if (view && view.debugging)
            console.log("PulsarView video " + text);
    }

    function wantsPlay() {
        if (source.toString().length === 0 || paused === true)
            return false;

        return paused === false || autoplay;
    }

    // Applies what the props ask for; playing again after the end only when asked to again.
    function sync() {
        if (released)
            return;

        if (source.toString().length === 0) {
            media.stop();

            return;
        }

        if (wantsPlay() && !ended) {
            if (media.playbackState !== MediaPlayer.PlayingState)
                media.play();
        } else if (paused === true && media.playbackState === MediaPlayer.PlayingState) {
            media.pause();
        }
    }

    onSourceChanged: {
        ended = false;
        Qt.callLater(sync);
    }
    onPausedChanged: {
        if (paused === false)
            ended = false;

        Qt.callLater(sync);
    }
    onAutoplayChanged: Qt.callLater(sync)

    Component.onDestruction: {
        // The player must not keep playing after its node is gone, and a queued sync must not start it again.
        released = true;
        log("released " + (media.playbackState === MediaPlayer.PlayingState ? "while playing" : "idle"));
        media.stop();
        media.source = "";
    }

    MediaPlayer {
        id: media

        source: videoRoot.source
        loops: videoRoot.loop ? MediaPlayer.Infinite : 1
        audioOutput: AudioOutput {
            muted: videoRoot.muted
            volume: videoRoot.volume
        }
        videoOutput: output

        onPlaybackStateChanged: videoRoot.log("state " + playbackState)
        onMediaStatusChanged: {
            videoRoot.log("status " + mediaStatus);

            if (mediaStatus === MediaPlayer.LoadedMedia || mediaStatus === MediaPlayer.BufferedMedia)
                videoRoot.sync();

            if (mediaStatus === MediaPlayer.EndOfMedia) {
                videoRoot.ended = true;

                if (videoRoot.view)
                    videoRoot.view.emitNodeEvent(videoRoot.nodeData, "ended");
            }
        }
        onErrorOccurred: function (error, errorString) {
            videoRoot.log("error " + errorString);

            if (videoRoot.view)
                videoRoot.view.emitNodeEvent(videoRoot.nodeData, "error", errorString);
        }
    }

    VideoOutput {
        id: output

        anchors.fill: parent
        fillMode: videoRoot.fillMode === "cover" ? VideoOutput.PreserveAspectCrop
                : videoRoot.fillMode === "stretch" ? VideoOutput.Stretch
                : VideoOutput.PreserveAspectFit
    }
}
