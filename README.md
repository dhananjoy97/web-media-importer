# Web Media Importer for Adobe Premiere Pro

A macOS panel to download media from web links and import it into your Premiere project.

- Video with audio, video only, or audio only.
- Quality selection and optional in/out range.
- Download progress, pause, resume, and stop.
- Image URLs and images copied to the macOS clipboard.
- Optional insertion at the playhead, or import into the Project panel only.

## Requirements

- macOS and Premiere Pro with CEP 9 or later support. Windows is not supported by this release.
- Install [Homebrew](https://brew.sh) if needed, then run `brew install yt-dlp ffmpeg` for video/audio downloads. These tools are installed separately and are not bundled.
- Public downloadable URLs. Authenticated downloads, cookies, and DRM-protected media are not supported.

## Use

Open a Premiere project, paste a URL, choose media type and quality, and click **Import**. Use **SS**, **MM:SS**, or **HH:MM:SS** for an optional range. To paste an image, copy the image itself in your browser first. Downloads stay in `~/Movies/Premiere Web Imports` until you remove them.

Timeline insertion uses overwrite operations on a track that is empty at the playhead. Media extending past the playhead may overwrite later clips on that track. For a populated sequence, use **Project panel only** and place the media manually. Always review timeline changes before saving.

Use only media you own, have permission to use, or are legally allowed to download. Respect the source site's terms. No project credentials or analytics are included; downloads connect to the URLs you supply, and files are stored locally.

## Install on macOS

1. Download the ZIP from **Releases** and extract it.
2. Quit the Adobe application.
3. Open Terminal in the extracted folder and run `bash install-mac.sh`.
4. The installer asks before enabling Adobe's unsigned CEP extension mode. This setting allows unsigned CEP panels in other Adobe applications too. Without it, these unsigned panels may not appear.
5. Restart the application and open the panel from **Window → Extensions** (or **Extensions (Legacy)**).

The installer makes a dated backup if the panel is already installed. It does not install external dependencies or require administrator access.

## Uninstall

Quit the Adobe application and remove the installed panel folder from `~/Library/Application Support/Adobe/CEP/extensions/`. If you no longer need any unsigned panels, reset the setting for each enabled CEP version with `defaults delete com.adobe.CSXS.11 PlayerDebugMode` (repeat for 9, 10, 12 and 13 as applicable). Resetting it affects other unsigned panels too.

## Support and compatibility

This is a community CEP extension, not an Adobe Marketplace signed package. Adobe version ranges in the manifest are not a compatibility test matrix. Release checks validate JavaScript syntax and packaging; operation inside each Adobe version needs user testing. Report your macOS version, Adobe version, steps, and error message in **Issues**. Remove private file paths or media links from logs before posting.

## License

MIT — free to use, modify and redistribute. See [LICENSE](LICENSE). Adobe product names belong to their respective owners; this project is independent of Adobe.
