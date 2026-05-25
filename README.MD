# VideoTogether

## VideoTogether Lite is a Chrome extension that syncs video playback with friends in real time.

## Visit http://2gether.video/ for more information

[ English ] [ [中文](https://github.com/VideoTogether/VideoTogether/blob/main/README_zh.MD) ]

## Installation

Load the unpacked extension from `source/chrome` after running the build script.


## Development

### Extension

The core code is `source/extension/vt.js`.

Run `python script/build_extension.py` to build the Chrome extension files in `source/chrome`.

This lite build keeps only room creation/joining and playback sync. Voice chat, text chat, local download, Easy Share, Safari, Firefox, website proxy, and generated release artifacts were removed.

### Service

service code is in `source/go-server`
