(function () {
  "use strict";

  var cs = new CSInterface();
  var nodeAvailable = typeof require === "function";
  var fs = nodeAvailable ? require("fs") : null;
  var os = nodeAvailable ? require("os") : null;
  var path = nodeAvailable ? require("path") : null;
  var childProcess = nodeAvailable ? require("child_process") : null;
  var https = nodeAvailable ? require("https") : null;
  var http = nodeAvailable ? require("http") : null;

  var els = {
    statusPill: document.getElementById("statusPill"),
    log: document.getElementById("log"),
    progressLabel: document.getElementById("progressLabel"),
    progressPercent: document.getElementById("progressPercent"),
    progressFill: document.getElementById("progressFill"),
    videoUrl: document.getElementById("videoUrl"),
    downloadType: document.getElementById("downloadType"),
    videoQuality: document.getElementById("videoQuality"),
    videoInPoint: document.getElementById("videoInPoint"),
    videoOutPoint: document.getElementById("videoOutPoint"),
    imageUrl: document.getElementById("imageUrl"),
    importVideo: document.getElementById("importVideo"),
    pauseDownload: document.getElementById("pauseDownload"),
    stopDownload: document.getElementById("stopDownload"),
    importImageUrl: document.getElementById("importImageUrl"),
    pasteImage: document.getElementById("pasteImage"),
    openDownloads: document.getElementById("openDownloads"),
    insertTimeline: document.getElementById("insertTimeline"),
    videoOnlyProject: document.getElementById("videoOnlyProject"),
  };

  var imageExtensions = {
    ".jpg": true,
    ".jpeg": true,
    ".png": true,
    ".webp": true,
    ".gif": true,
    ".tif": true,
    ".tiff": true,
  };

  var activeDownload = null;

  function setStatus(text, state) {
    els.statusPill.textContent = text;
    els.statusPill.className = "pill" + (state ? " " + state : "");
  }

  function log(message) {
    var stamp = new Date().toLocaleTimeString();
    els.log.textContent += "[" + stamp + "] " + message + "\n";
    els.log.scrollTop = els.log.scrollHeight;
  }

  function setBusy(isBusy) {
    els.importVideo.disabled = isBusy;
    els.importImageUrl.disabled = isBusy;
    els.pasteImage.disabled = isBusy;
    setStatus(isBusy ? "Working" : "Ready", isBusy ? "busy" : "");
  }

  function fail(error) {
    var message = error && error.message ? error.message : String(error);
    setStatus("Error", "error");
    log("Error: " + message);
  }

  function setProgress(percent, label) {
    var safePercent = Math.max(0, Math.min(100, percent || 0));
    els.progressFill.style.width = safePercent + "%";
    els.progressPercent.textContent = Math.round(safePercent) + "%";
    if (label) els.progressLabel.textContent = label;
  }

  function parseProgress(text) {
    var match = text.match(/\[download\]\s+([0-9]+(?:\.[0-9]+)?)%/);
    if (!match) return;

    var percent = parseFloat(match[1]);
    var speedMatch = text.match(/at\s+([^\s]+\/s)/);
    var etaMatch = text.match(/ETA\s+([0-9:]+)/);
    var details = "Downloading";
    if (speedMatch) details += " at " + speedMatch[1];
    if (etaMatch) details += " · ETA " + etaMatch[1];
    setProgress(percent, details);
  }

  function requireNode() {
    if (!nodeAvailable) {
      throw new Error("Node.js is not enabled in CEP. Check the manifest and restart Premiere Pro.");
    }
  }

  function hostString(value) {
    return JSON.stringify(String(value)).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  }

  function mediaRoot() {
    var root = path.join(os.homedir(), "Movies", "Premiere Web Imports");
    if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
    return root;
  }

  function findExecutable(names) {
    var searchDirs = (process.env.PATH || "").split(":").concat([
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
    ]);
    for (var i = 0; i < names.length; i++) {
      for (var j = 0; j < searchDirs.length; j++) {
        var candidate = path.join(searchDirs[j], names[i]);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
    return "";
  }

  function sanitizeName(name) {
    return String(name || "download")
      .replace(/[\/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
  }

  function run(command, args, onLine, options) {
    return new Promise(function (resolve, reject) {
      var env = {};
      for (var key in process.env) env[key] = process.env[key];
      env.PATH = [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        env.PATH || "",
      ].join(":");

      var proc = childProcess.spawn(command, args, { cwd: mediaRoot(), env: env });
      var stderr = "";
      var stoppedByUser = false;

      if (options && options.controllable) {
        activeDownload = {
          proc: proc,
          paused: false,
          stop: function () {
            stoppedByUser = true;
            try {
              if (this.paused) proc.kill("SIGCONT");
              proc.kill("SIGTERM");
            } catch (ignored) {}
          },
          togglePause: function () {
            try {
              if (this.paused) {
                proc.kill("SIGCONT");
                this.paused = false;
                els.pauseDownload.textContent = "⏸";
                setStatus("Working", "busy");
                setProgress(parseInt(els.progressPercent.textContent, 10) || 0, "Resumed");
              } else {
                proc.kill("SIGSTOP");
                this.paused = true;
                els.pauseDownload.textContent = "▶";
                setStatus("Paused", "busy");
                setProgress(parseInt(els.progressPercent.textContent, 10) || 0, "Paused");
              }
            } catch (error) {
              reject(error);
            }
          },
        };
      }

      proc.stdout.on("data", function (chunk) {
        var text = chunk.toString();
        if (onLine) onLine(text);
      });

      proc.stderr.on("data", function (chunk) {
        var text = chunk.toString();
        stderr += text;
        if (onLine) onLine(text);
      });

      proc.on("error", reject);
      proc.on("close", function (code) {
        if (activeDownload && activeDownload.proc === proc) activeDownload = null;
        els.pauseDownload.textContent = "⏸";
        if (code === 0) resolve();
        else if (stoppedByUser) reject(new Error("Download stopped."));
        else reject(new Error(stderr || command + " exited with code " + code));
      });
    });
  }

  function newestFileIn(dir, sinceMs) {
    var importableExtensions = {
      ".mp4": true,
      ".mov": true,
      ".m4v": true,
      ".m4a": true,
      ".mp3": true,
      ".wav": true,
      ".aac": true,
      ".jpg": true,
      ".jpeg": true,
      ".png": true,
      ".webp": true,
      ".gif": true,
      ".tif": true,
      ".tiff": true,
    };

    var files = fs
      .readdirSync(dir)
      .map(function (name) {
        var full = path.join(dir, name);
        var stat = fs.statSync(full);
        return { full: full, mtimeMs: stat.mtimeMs, isFile: stat.isFile() };
      })
      .filter(function (entry) {
        var ext = path.extname(entry.full).toLowerCase();
        return entry.isFile && entry.mtimeMs >= sinceMs - 2000 && importableExtensions[ext];
      })
      .sort(function (a, b) {
        return b.mtimeMs - a.mtimeMs;
      });
    return files.length ? files[0].full : "";
  }

  function videoFormatForQuality(quality) {
    if (quality === "fast") return "worst[ext=mp4]/worst";
    if (quality === "best") return "bv*+ba/b";

    var height = parseInt(quality, 10);
    if (!height) height = 720;

    return [
      "b[height<=" + height + "][ext=mp4]",
      "bv*[height<=" + height + "][ext=mp4]+ba[ext=m4a]",
      "bv*[height<=" + height + "]+ba",
      "b[height<=" + height + "]",
      "best[ext=mp4]",
      "best",
    ].join("/");
  }

  function formatForDownload(downloadType, quality) {
    if (downloadType === "audio") return "ba[ext=m4a]/ba/bestaudio";
    if (downloadType === "video") return videoOnlyFormatForQuality(quality);
    return videoFormatForQuality(quality);
  }

  function videoOnlyFormatForQuality(quality) {
    if (quality === "fast") return "worstvideo[ext=mp4]/worstvideo";
    if (quality === "best") return "bv*[ext=mp4]/bv*/bestvideo";

    var height = parseInt(quality, 10);
    if (!height) height = 720;

    return [
      "bv*[height<=" + height + "][ext=mp4]",
      "bv*[height<=" + height + "]",
      "bestvideo[height<=" + height + "][ext=mp4]",
      "bestvideo[height<=" + height + "]",
      "best[ext=mp4]",
      "best",
    ].join("/");
  }

  function normalizeTime(value, fieldName) {
    var input = String(value || "").trim();
    if (!input) return "";

    if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(input)) {
      throw new Error(fieldName + " must use SS, MM:SS, or HH:MM:SS.");
    }

    var parts = input.split(":");
    for (var i = 0; i < parts.length; i++) {
      if (i > 0 && parseFloat(parts[i]) >= 60) {
        throw new Error(fieldName + " has an invalid time value.");
      }
    }

    while (parts.length < 3) parts.unshift("0");
    return parts
      .map(function (part, index) {
        if (index === 2 && part.indexOf(".") !== -1) {
          var seconds = part.split(".");
          return ("0" + seconds[0]).slice(-2) + "." + seconds[1];
        }
        return part.length < 2 ? "0" + part : part;
      })
      .join(":");
  }

  function secondsFromTime(value) {
    if (!value) return null;
    var parts = value.split(":");
    return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
  }

  function sectionFromTimes(inPoint, outPoint) {
    var start = normalizeTime(inPoint, "In point");
    var end = normalizeTime(outPoint, "Out point");
    if (!start && !end) return "";

    var startSeconds = secondsFromTime(start);
    var endSeconds = secondsFromTime(end);
    if (startSeconds !== null && endSeconds !== null && endSeconds <= startSeconds) {
      throw new Error("Out point must be later than In point.");
    }

    return "*" + (start || "00:00:00") + "-" + (end || "inf");
  }

  function safeJobSuffix(section, downloadType) {
    var type = downloadType || "media";
    var range = section ? section.replace(/^\*/, "").replace(/:/g, "-").replace(/\./g, "-") : "full";
    return type + "-" + range + "-" + Date.now();
  }

  function downloadVideo(url, quality, section, downloadType) {
    var parsedUrl = new URL(url);
    if (!/^https?:$/.test(parsedUrl.protocol)) throw new Error("Use an HTTP or HTTPS video URL.");
    var ytDlp = findExecutable(["yt-dlp"]);
    if (!ytDlp) {
      throw new Error("yt-dlp was not found. Install it on macOS with: brew install yt-dlp");
    }

    var ffmpeg = findExecutable(["ffmpeg"]);
    if ((downloadType === "audio" || quality === "1080" || quality === "best" || section) && !ffmpeg) {
      throw new Error("This download needs ffmpeg to merge/cut media. Install it with: brew install ffmpeg");
    }

    var started = Date.now();
    var output = path.join(mediaRoot(), "%(title).150B-%(id)s-" + safeJobSuffix(section, downloadType) + ".%(ext)s");
    var args = [
      "-f",
      formatForDownload(downloadType, quality),
      "--restrict-filenames",
      "--no-playlist",
      "-o",
      output,
    ];

    if (downloadType === "audio") {
      args.splice(2, 0, "--extract-audio", "--audio-format", "m4a");
    } else {
      args.splice(2, 0, "--merge-output-format", "mp4", "--remux-video", "mp4");
    }

    if (ffmpeg) {
      args.splice(6, 0, "--ffmpeg-location", path.dirname(ffmpeg));
    }

    if (section) {
      args.push("--download-sections", section, "--force-keyframes-at-cuts");
    }
    args.push("--", url);

    log("Downloading " + labelForDownload(downloadType, quality) + "...");
    if (section) log("Selected section: " + section.replace("*", ""));
    setProgress(0, "Starting download");
    return run(ytDlp, args, function (line) {
      parseProgress(line);
      line
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach(log);
    }, { controllable: true }).then(function () {
      setProgress(100, "Processing import");
      var file = newestFileIn(mediaRoot(), started);
      if (!file) throw new Error("Download finished, but no output file was found.");
      return file;
    });
  }

  function labelForQuality(quality) {
    if (quality === "fast") return "fastest preview quality";
    if (quality === "best") return "best available quality";
    return "up to " + quality + "p";
  }

  function labelForDownloadType(downloadType) {
    if (downloadType === "audio") return "audio only";
    if (downloadType === "video") return "video only";
    return "video and audio";
  }

  function labelForDownload(downloadType, quality) {
    if (downloadType === "audio") return "audio only";
    return labelForDownloadType(downloadType) + " at " + labelForQuality(quality);
  }

  function extensionForContentType(contentType) {
    if (/png/i.test(contentType)) return ".png";
    if (/webp/i.test(contentType)) return ".webp";
    if (/gif/i.test(contentType)) return ".gif";
    if (/tiff?/i.test(contentType)) return ".tif";
    return ".jpg";
  }

  function downloadFile(url, preferredName, redirects) {
    return new Promise(function (resolve, reject) {
      var parsedUrl = new URL(url);
      if (!/^https?:$/.test(parsedUrl.protocol)) return reject(new Error("Use an HTTP or HTTPS image URL."));
      if ((redirects || 0) > 5) return reject(new Error("Too many image redirects."));
      var client = parsedUrl.protocol === "https:" ? https : http;
      client
        .get(url, function (response) {
          if ([301, 302, 303, 307, 308].indexOf(response.statusCode) !== -1 && response.headers.location) {
            response.resume();
            resolve(downloadFile(new URL(response.headers.location, url).toString(), preferredName, (redirects || 0) + 1));
            return;
          }

          if (response.statusCode < 200 || response.statusCode >= 300) {
            response.resume();
            reject(new Error("Download failed with HTTP " + response.statusCode));
            return;
          }

          var parsed = new URL(url);
          var ext = path.extname(parsed.pathname).toLowerCase();
          if (!imageExtensions[ext]) ext = extensionForContentType(response.headers["content-type"] || "");
          var filename = sanitizeName(preferredName || path.basename(parsed.pathname, path.extname(parsed.pathname))) + ext;
          var target = path.join(mediaRoot(), filename);
          var stream = fs.createWriteStream(target);

          response.pipe(stream);
          response.on("error", reject);
          response.on("aborted", function () { stream.destroy(); reject(new Error("Image download interrupted.")); });
          stream.on("finish", function () {
            stream.close(function () {
              resolve(target);
            });
          });
          stream.on("error", reject);
        })
        .on("error", reject);
    });
  }

  function saveClipboardImage(file) {
    return new Promise(function (resolve, reject) {
      var ext = file.type === "image/png" ? ".png" : file.type === "image/webp" ? ".webp" : ".jpg";
      var target = path.join(mediaRoot(), "pasted-image-" + Date.now() + ext);
      var reader = new FileReader();
      reader.onload = function () {
        var buffer = Buffer.from(new Uint8Array(reader.result));
        fs.writeFile(target, buffer, function (error) {
          if (error) reject(error);
          else resolve(target);
        });
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  function saveClipboardImageFromMacPasteboard() {
    return new Promise(function (resolve, reject) {
      var basePath = path.join(mediaRoot(), "pasted-image-" + Date.now());
      var script = [
        'use framework "AppKit"',
        "use scripting additions",
        "",
        "on run argv",
        "  set basePath to item 1 of argv",
        "  set pb to current application's NSPasteboard's generalPasteboard()",
        '  set typeList to {current application\'s NSPasteboardTypePNG, "public.jpeg", current application\'s NSPasteboardTypeTIFF, "com.compuserve.gif"}',
        '  set extList to {".png", ".jpg", ".tiff", ".gif"}',
        "  repeat with i from 1 to count of typeList",
        "    set theType to item i of typeList",
        "    set theData to (pb's dataForType:theType)",
        "    if theData is not missing value then",
        "      set outPath to basePath & (item i of extList)",
        "      set ok to (theData's writeToFile:outPath atomically:true)",
        "      if ok as boolean then return outPath",
        "    end if",
        "  end repeat",
        '  error "No image data found on the macOS clipboard."',
        "end run",
      ].join("\n");

      var proc = childProcess.spawn("osascript", ["-", basePath], { stdio: ["pipe", "pipe", "pipe"] });
      var stdout = "";
      var stderr = "";

      proc.stdout.on("data", function (chunk) {
        stdout += chunk.toString();
      });
      proc.stderr.on("data", function (chunk) {
        stderr += chunk.toString();
      });
      proc.on("error", reject);
      proc.on("close", function (code) {
        if (code !== 0) {
          reject(new Error((stderr || "Could not read image from macOS clipboard.").trim()));
          return;
        }

        var filePath = stdout.trim();
        if (!filePath || !fs.existsSync(filePath)) {
          reject(new Error("The clipboard image was read, but no saved file was found."));
          return;
        }

        resolve(filePath);
      });

      proc.stdin.write(script);
      proc.stdin.end();
    });
  }

  function evalHost(functionName, args) {
    return new Promise(function (resolve, reject) {
      var script = functionName + "(" + args.map(hostString).join(",") + ")";
      cs.evalScript(script, function (result) {
        if (/^ERROR:|^EvalScript error/.test(result)) reject(new Error(result.replace(/^ERROR:\s*/, "")));
        else resolve(result);
      });
    });
  }

  function importIntoPremiere(filePath, insertTimeline, mediaKind) {
    log("Importing into Premiere: " + filePath);
    return evalHost("webImporterImportFile", [filePath, insertTimeline ? "true" : "false", mediaKind || "auto"]).then(function (result) {
      log(result);
    });
  }

  function shouldInsertTimeline(kind) {
    if ((kind === "video" || kind === "video-audio") && els.videoOnlyProject.checked) return false;
    return els.insertTimeline.checked;
  }

  async function handleVideoImport() {
    requireNode();
    var url = els.videoUrl.value.trim();
    if (!url) throw new Error("Paste a video URL first.");
    var section = sectionFromTimes(els.videoInPoint.value, els.videoOutPoint.value);
    setBusy(true);
    els.pauseDownload.disabled = false;
    els.stopDownload.disabled = false;
    var file = await downloadVideo(url, els.videoQuality.value, section, els.downloadType.value);
    var mediaKind = els.downloadType.value;
    await importIntoPremiere(file, shouldInsertTimeline(mediaKind), mediaKind);
    setProgress(100, "Imported");
    setStatus("Done");
  }

  async function handleImageUrlImport() {
    requireNode();
    var url = els.imageUrl.value.trim();
    if (!url) throw new Error("Paste an image URL first.");
    setBusy(true);
    setProgress(20, "Downloading image");
    log("Downloading image...");
    var file = await downloadFile(url, "web-image-" + Date.now());
    setProgress(80, "Importing image");
    await importIntoPremiere(file, shouldInsertTimeline("image"), "image");
    setProgress(100, "Imported");
    setStatus("Done");
  }

  async function handlePasteImage() {
    requireNode();
    setBusy(true);
    setProgress(10, "Reading clipboard");

    var text = "";
    if (navigator.clipboard && navigator.clipboard.readText) {
      try {
        text = await navigator.clipboard.readText();
      } catch (error) {
        text = "";
      }
    }

    if (/^https?:\/\//i.test(text) && /\.(png|jpe?g|webp|gif|tiff?)(\?|#|$)/i.test(text)) {
      log("Clipboard contains an image URL.");
      var imageFromText = await downloadFile(text, "clipboard-image-" + Date.now());
      setProgress(80, "Importing image");
      await importIntoPremiere(imageFromText, shouldInsertTimeline("image"), "image");
      setProgress(100, "Imported");
      setStatus("Done");
      return;
    }

    if (navigator.clipboard && navigator.clipboard.read) {
      try {
        var items = await navigator.clipboard.read();
        for (var i = 0; i < items.length; i++) {
          var types = items[i].types || [];
          for (var j = 0; j < types.length; j++) {
            if (types[j].indexOf("image/") === 0) {
              var blob = await items[i].getType(types[j]);
              var imageFile = await saveClipboardImage(blob);
              setProgress(80, "Importing image");
              await importIntoPremiere(imageFile, shouldInsertTimeline("image"), "image");
              setProgress(100, "Imported");
              setStatus("Done");
              return;
            }
          }
        }
      } catch (error) {
        log("Browser clipboard read failed, trying macOS clipboard.");
      }
    }

    log("Trying macOS clipboard image data.");
    var macImageFile = await saveClipboardImageFromMacPasteboard();
    setProgress(80, "Importing image");
    await importIntoPremiere(macImageFile, shouldInsertTimeline("image"), "image");
    setProgress(100, "Imported");
    setStatus("Done");
  }

  function bind(button, handler) {
    button.addEventListener("click", function () {
      Promise.resolve()
        .then(handler)
        .catch(fail)
        .finally(function () {
          els.pauseDownload.disabled = true;
          els.stopDownload.disabled = true;
          els.pauseDownload.textContent = "⏸";
          setBusy(false);
        });
    });
  }

  bind(els.importVideo, handleVideoImport);
  bind(els.importImageUrl, handleImageUrlImport);
  bind(els.pasteImage, handlePasteImage);

  function syncDownloadTypeControls() {
    var audioOnly = els.downloadType.value === "audio";
    els.videoQuality.disabled = audioOnly;
    syncChoiceButtons("downloadType");
    syncChoiceButtons("videoQuality");
    setChoiceButtonsDisabled("videoQuality", audioOnly);
  }

  els.downloadType.addEventListener("change", syncDownloadTypeControls);
  els.videoQuality.addEventListener("change", function () {
    syncChoiceButtons("videoQuality");
  });

  function syncChoiceButtons(selectId) {
    var select = document.getElementById(selectId);
    var buttons = document.querySelectorAll('[data-select="' + selectId + '"]');
    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].getAttribute("data-value") === select.value) {
        buttons[i].classList.add("active");
      } else {
        buttons[i].classList.remove("active");
      }
    }
  }

  function setChoiceButtonsDisabled(selectId, disabled) {
    var buttons = document.querySelectorAll('[data-select="' + selectId + '"]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].disabled = disabled;
    }
  }

  function bindChoiceButtons() {
    var buttons = document.querySelectorAll("[data-select][data-value]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function () {
        var select = document.getElementById(this.getAttribute("data-select"));
        if (!select || this.disabled) return;
        select.value = this.getAttribute("data-value");
        var event = document.createEvent("HTMLEvents");
        event.initEvent("change", true, false);
        select.dispatchEvent(event);
      });
    }
  }

  bindChoiceButtons();
  syncDownloadTypeControls();

  els.openDownloads.addEventListener("click", function () {
    try {
      requireNode();
      var root = mediaRoot();
      childProcess.spawn("open", [root], { detached: true, stdio: "ignore" }).unref();
      log("Opened downloads folder: " + root);
    } catch (error) {
      fail(error);
    }
  });

  els.pauseDownload.addEventListener("click", function () {
    if (activeDownload) activeDownload.togglePause();
  });

  els.stopDownload.addEventListener("click", function () {
    if (activeDownload) {
      setProgress(parseInt(els.progressPercent.textContent, 10) || 0, "Stopping");
      activeDownload.stop();
    }
  });

  log("Panel loaded.");
})();
