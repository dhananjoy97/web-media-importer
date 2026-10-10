function webImporterImportFile(filePath, insertTimeline, mediaKind) {
  try {
    if (!app.project) {
      return "ERROR: Open a Premiere Pro project first.";
    }

    var file = new File(filePath);
    if (!file.exists) {
      return "ERROR: File does not exist: " + filePath;
    }

    var imported = app.project.importFiles([file.fsName], true, app.project.rootItem, false);
    if (!imported) {
      return "ERROR: Premiere could not import this media.";
    }

    var projectItem = findProjectItemByPath(app.project.rootItem, file.fsName);
    if (insertTimeline === "true") {
      var sequence = app.project.activeSequence;
      if (!sequence) {
        return "Imported to project. Open or create a sequence to insert it on the timeline.";
      }

      if (!projectItem) {
        return "Imported to project, but could not find the project item to place on the timeline.";
      }

      var placed = insertProjectItem(sequence, projectItem, mediaKind);
      if (!placed) {
        return "Imported to project, but timeline insertion failed. Drag it from the Project panel manually.";
      }

      return "Imported and inserted on the active timeline.";
    }

    return "Imported to project.";
  } catch (error) {
    return "ERROR: " + error.toString();
  }
}

function findProjectItemByPath(parent, fsName) {
  if (!parent || !parent.children) return null;

  for (var i = 0; i < parent.children.numItems; i++) {
    var item = parent.children[i];
    if (item) {
      try {
        if (item.getMediaPath && item.getMediaPath() === fsName) {
          return item;
        }
      } catch (ignored) {}

      var found = findProjectItemByPath(item, fsName);
      if (found) return found;
    }
  }

  return null;
}

function insertProjectItem(sequence, projectItem, mediaKind) {
  var time = sequence.getPlayerPosition();
  var targetVideo = null;
  var targetAudio = null;

  if (mediaKind === "audio") {
    targetAudio = findFirstEmptyTrackAtTime(sequence.audioTracks, time);
    if (!targetAudio) return false;
    return overwriteOnTrack(targetAudio.track, projectItem, time);
  }

  if (mediaKind === "video-audio") {
    targetVideo = findFirstEmptyTrackAtTime(sequence.videoTracks, time);
    targetAudio = findFirstEmptyTrackAtTime(sequence.audioTracks, time);
    if (!targetVideo || !targetAudio) return false;

    try {
      if (sequence.overwriteClip) {
        sequence.overwriteClip(projectItem, time, targetVideo.index, targetAudio.index);
        return true;
      }
    } catch (ignored) {}

    return overwriteOnTrack(targetVideo.track, projectItem, time);
  }

  targetVideo = findFirstEmptyTrackAtTime(sequence.videoTracks, time);
  if (!targetVideo) return false;
  return overwriteOnTrack(targetVideo.track, projectItem, time);
}

function overwriteOnTrack(track, projectItem, time) {
  try {
    if (track.overwriteClip) {
      track.overwriteClip(projectItem, time);
      return true;
    }
  } catch (ignored) {}

  return false;
}

function findFirstEmptyTrackAtTime(tracks, time) {
  if (!tracks || tracks.numTracks < 1) return null;

  for (var i = 0; i < tracks.numTracks; i++) {
    var track = tracks[i];
    if (trackIsEmptyAtTime(track, time)) {
      return {
        track: track,
        index: i,
      };
    }
  }

  return null;
}

function trackIsEmptyAtTime(track, time) {
  if (!track || !track.clips) return false;

  var seconds = timeToSeconds(time);
  for (var i = 0; i < track.clips.numItems; i++) {
    var clip = track.clips[i];
    if (!clip) continue;

    var start = timeToSeconds(clip.start);
    var end = timeToSeconds(clip.end);
    if (seconds >= start && seconds < end) {
      return false;
    }
  }

  return true;
}

function timeToSeconds(time) {
  try {
    return time.seconds;
  } catch (ignored) {
    return 0;
  }
}
