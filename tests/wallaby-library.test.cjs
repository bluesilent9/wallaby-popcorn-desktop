// Historical server-UI experiment; not shipped by the restored desktop.
// Lightweight source-only checks. Run with node --test tests/wallaby-library.test.cjs.
const { test:historicalTest } = require('node:test');
const test = name => historicalTest(name, {skip:'Client UI overrides retired in revision8'}, () => {});
const assert = require('node:assert/strict');
const { fileDetails, languageInfo } = require('../native/wallaby-library.js');

test('original language comes from title metadata even when the file has a different language', () => {
    const details = fileDetails({ OriginalLanguage: 'en', MediaStreams: [
        { Type: 'Video', Width: 1280, Height: 720, Codec: 'h264' },
        { Type: 'Audio', Codec: 'eac3', Language: 'jpn', ChannelLayout: '5.1(side)', Channels: 6, BitRate: 640000, SampleRate: 48000 },
        { Type: 'Subtitle', Language: 'eng' }, { Type: 'Subtitle', Language: 'en' }, { Type: 'Subtitle', Language: 'rus' }
    ] });
    assert.equal(details.originalLanguage, 'English');
    assert.equal(details.video, '720p · H.264');
    assert.equal(details.audio, 'Dolby Digital Plus · 5.1 Surround');
    assert.equal(details.audioQuality, '640 kb/s · 48 kHz');
    assert.equal(details.dolby, true);
    assert.deepEqual(details.subtitles, [{code:'En', name:'English'}, {code:'Ru', name:'Russian'}]);
});

test('missing metadata is not inferred from file language or scraping preferences', () => {
    const details = fileDetails({ PreferredMetadataLanguage:'ru', MediaStreams:[{Type:'Audio',Codec:'aac',Language:'eng',Channels:6}] });
    assert.equal(details.originalLanguage, 'Not provided by server');
    assert.equal(details.audio, 'AAC · 6 channels');
    assert.equal(details.dolby, false);
    assert.deepEqual(languageInfo('und'), {code:'?',name:'Unspecified'});
    assert.deepEqual(fileDetails({Type:'Series'}).subtitles, []);
});

test('file metadata follows the displayed version and its default audio stream', () => {
    const details = fileDetails({MediaSources:[{Name:'1080p version',DefaultAudioStreamIndex:2,MediaStreams:[
        {Type:'Video', Width:1920,Height:804,Codec:'hevc'},
        {Type:'Audio',Index:1,Codec:'ac3',IsDefault:true,ChannelLayout:'5.1'},
        {Type:'Audio',Index:2,Codec:'flac',ChannelLayout:'stereo',BitDepth:24}
    ]},{Name:'4K version',MediaStreams:[{Type:'Video',Width:3840,Height:2160}]}]});
    assert.equal(details.video, '1080p · HEVC');
    assert.equal(details.audio, 'FLAC · Stereo');
    assert.equal(details.audioQuality, '24-bit');
    assert.equal(details.sourceName, '1080p version');
    assert.equal(details.dolby, false);
});
