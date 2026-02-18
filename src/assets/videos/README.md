# Video Assets for Landing Page

## How to Add Your Video

### Option 1: Local Video File (Recommended for Small Videos)

1. **Place your video file here** in this folder:
   - `deaf-sports-history.mp4` (primary)
   - `deaf-sports-history.webm` (optional for better compression)

2. **Edit `/src/index.html`**:
   - Find the commented section `<!-- Option 1: Local Video File -->`
   - **Uncomment** those lines (remove the `<!--` and `-->`)
   - **Comment out** or delete the placeholder: `<div class="video-placeholder"></div>`

```html
<!-- Uncomment this: -->
<video autoplay muted loop playsinline id="bgVideo">
  <source src="./assets/videos/deaf-sports-history.mp4" type="video/mp4">
  <source src="./assets/videos/deaf-sports-history.webm" type="video/webm">
</video>

<!-- Delete or comment out this: -->
<!-- <div class="video-placeholder"></div> -->
```

---

### Option 2: YouTube Video (Easiest, No File Upload)

1. **Find your YouTube video ID**:
   - Example: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
   - The ID is: `dQw4w9WgXcQ`

2. **Edit `/src/index.html`**:
   - Find the commented section `<!-- Option 2: YouTube Video Background -->`
   - **Uncomment** those lines
   - **Replace** `YOUR_VIDEO_ID` with your actual video ID (in 2 places)
   - **Comment out** the placeholder div

```html
<!-- Uncomment this and replace YOUR_VIDEO_ID: -->
<iframe
  id="ytPlayer"
  src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&loop=1&controls=0&showinfo=0&modestbranding=1&playlist=dQw4w9WgXcQ"
  frameborder="0"
  allow="autoplay; encrypted-media"
  allowfullscreen>
</iframe>

<!-- Delete or comment out this: -->
<!-- <div class="video-placeholder"></div> -->
```

---

### Option 3: Upload to Supabase Storage (For Large Files)

1. **Go to your Supabase project** → Storage → Create a new bucket called `videos`
2. **Upload your video** to the bucket
3. **Make it public**: Bucket settings → Make public
4. **Get the public URL** (looks like: `https://[project].supabase.co/storage/v1/object/public/videos/deaf-sports-history.mp4`)
5. **Edit `/src/index.html`** and use that URL:

```html
<video autoplay muted loop playsinline id="bgVideo">
  <source src="https://[your-project].supabase.co/storage/v1/object/public/videos/deaf-sports-history.mp4" type="video/mp4">
</video>
```

---

## Current Status

**Right now:** A placeholder gradient background is showing until you add a video.

**To activate your video:** Follow one of the options above!

---

## Video Recommendations

- **Format**: MP4 (H.264 codec) for best compatibility
- **Resolution**: 1920x1080 (Full HD) is ideal
- **Length**: 30 seconds to 2 minutes works well for loops
- **File Size**: Keep under 10MB for fast loading (compress if needed)
- **Content**: Deaf sports history, game highlights, school photos with Ken Burns effect

**Compression Tools:**
- HandBrake (free desktop app)
- CloudConvert (online)
- FFmpeg command: `ffmpeg -i input.mp4 -vcodec h264 -crf 28 output.mp4`
