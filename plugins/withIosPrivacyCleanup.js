const { withInfoPlist } = require('@expo/config-plugins');

/**
 * Trailing Info.plist cleanup for App Store compliance. It is listed LAST in
 * app.config.ts `plugins`, so it runs after the bundled config plugins
 * (expo-audio, expo-sensors) and can undo the plist keys they add
 * unconditionally but that Kratos does not actually need:
 *
 *  • UIBackgroundModes 'audio' — expo-audio's plugin ALWAYS pushes this
 *    (node_modules/expo-audio/plugin/build/withAudio.js), but Kratos only records
 *    in the FOREGROUND (src/app/voice/record.tsx: setAudioModeAsync without
 *    staysActiveInBackground; recording stops on unmount). Declaring an 'audio'
 *    background mode with no background playback/recording is a Guideline 2.5.4
 *    rejection ("declares a background mode it doesn't use"), so strip it — and
 *    drop the key entirely if nothing else is left in it.
 *
 *  • NSMotionUsageDescription — only the unreachable Phase-2 "floor mode" code
 *    (src/components/voice/FloorMode.tsx, src/lib/floorSensor.ts) imports
 *    expo-sensors; nothing in the shipping UI reads device motion. Remove the
 *    generic, unused motion permission string so the binary doesn't advertise a
 *    capability the app never exercises (a 5.1.1 purpose-string smell).
 */
const withIosPrivacyCleanup = (config) =>
  withInfoPlist(config, (cfg) => {
    const plist = cfg.modResults;

    if (Array.isArray(plist.UIBackgroundModes)) {
      plist.UIBackgroundModes = plist.UIBackgroundModes.filter((m) => m !== 'audio');
      if (plist.UIBackgroundModes.length === 0) delete plist.UIBackgroundModes;
    }

    delete plist.NSMotionUsageDescription;

    return cfg;
  });

module.exports = withIosPrivacyCleanup;
