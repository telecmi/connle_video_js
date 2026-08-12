#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>

#import "RNVoipPushNotificationManager.h"
#import "RNCallKeep.h"
#import <PushKit/PushKit.h>
#import "LivekitReactNative.h"

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  // Official LiveKit RN requirement: initialize the media engine BEFORE any
  // React Native initialization.
  [LivekitReactNative setup];

  self.moduleName = @"ConnleVideoExample";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  // Native CallKeep setup so Answer/End taps that happen before the React
  // Native bridge is ready are queued and replayed to JS after launch.
  [RNCallKeep setup:@{
    @"appName": @"ConnleVideoExample",
    @"supportsVideo": @YES,
    @"handleType": @"number",
  }];

  // Register for VoIP push (PushKit). iOS issues the VoIP token, which the
  // connle-video SDK registers with connly_rest automatically.
  [RNVoipPushNotificationManager voipRegistration];

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

#pragma mark - PushKit (VoIP) — incoming video-call wake-ups

// iOS issued/updated the VoIP token -> forward to JS; the SDK registers it.
- (void)pushRegistry:(PKPushRegistry *)registry
didUpdatePushCredentials:(PKPushCredentials *)credentials
             forType:(PKPushType)type
{
  [RNVoipPushNotificationManager didUpdatePushCredentials:credentials forType:(NSString *)type];
}

// A VoIP push arrived (app backgrounded or killed). iOS 13+ REQUIRES reporting
// a CallKit call synchronously here, then we hand the payload to JS.
//
// Video payload: {type:'video_call', call_id, media, token, room, from} — the
// call_id is a UUID and becomes the CallKit uuid, so the matching
// {type:'video_cancel', call_id} can dismiss the exact ringing call.
- (void)pushRegistry:(PKPushRegistry *)registry
didReceiveIncomingPushWithPayload:(PKPushPayload *)payload
             forType:(PKPushType)type
withCompletionHandler:(void (^)(void))completion
{
  NSString *uuid = payload.dictionaryPayload[@"call_id"]
      ?: payload.dictionaryPayload[@"uuid"]
      ?: [[NSUUID UUID] UUIDString];
  NSString *caller = payload.dictionaryPayload[@"from"] ?: payload.dictionaryPayload[@"caller"] ?: @"Incoming call";
  // Human name for the CallKit screen; the handle stays the user_id so
  // answer/recents keep a stable identity.
  NSString *fromName = payload.dictionaryPayload[@"from_name"];
  NSString *callerDisplay = ([fromName isKindOfClass:[NSString class]] && fromName.length > 0)
      ? fromName : caller;
  BOOL isCancel = [payload.dictionaryPayload[@"type"] isEqual:@"video_cancel"];
  // EVERY call on this platform is a video call. hasVideo=YES is what makes
  // iOS dismiss its own call screen on answer and open the app (audio calls
  // stay on the system screen — never wanted here).
  BOOL hasVideo = YES;

  // TEMP DEBUG — ground truth of what reaches CallKit; pulled off-device.
  {
    NSString *dbgLine = [NSString stringWithFormat:@"%@ report uuid=%@ hasVideo=%d cancel=%d name=%@\n",
        [NSDate date], uuid, hasVideo, isCancel, callerDisplay];
    NSString *docs = [NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES) firstObject];
    NSString *dbgPath = [docs stringByAppendingPathComponent:@"callkit-debug.txt"];
    NSFileHandle *fh = [NSFileHandle fileHandleForWritingAtPath:dbgPath];
    if (!fh) {
      [[NSFileManager defaultManager] createFileAtPath:dbgPath contents:nil attributes:nil];
      fh = [NSFileHandle fileHandleForWritingAtPath:dbgPath];
    }
    @try { [fh seekToEndOfFile]; [fh writeData:[dbgLine dataUsingEncoding:NSUTF8StringEncoding]]; [fh closeFile]; } @catch (id e) { }
  }

  // Keep the JS thread scheduled long enough to connect the call on a locked
  // device; otherwise iOS suspends it right after the push.
  UIApplication *app = [UIApplication sharedApplication];
  __block UIBackgroundTaskIdentifier bgTask =
      [app beginBackgroundTaskWithExpirationHandler:^{
        [app endBackgroundTask:bgTask];
        bgTask = UIBackgroundTaskInvalid;
      }];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(25 * NSEC_PER_SEC)),
                 dispatch_get_main_queue(), ^{
    if (bgTask != UIBackgroundTaskInvalid) {
      [app endBackgroundTask:bgTask];
      bgTask = UIBackgroundTaskInvalid;
    }
  });

  if (isCancel) {
    // Multi-device dismissal: the cancel goes to ALL of the user's devices —
    // if THIS device already answered (call is active), the cancel is meant
    // for the siblings only. Apple still requires reporting a call for every
    // VoIP push, so report a throwaway uuid and end it, leaving the live
    // call untouched.
    if ([RNCallKeep isCallActive:uuid] || [RNCallKeep wasCallAnswered:uuid]) {
      NSString *dummy = [[NSUUID UUID] UUIDString];
      [RNCallKeep reportNewIncomingCall:dummy
                                 handle:caller
                             handleType:@"number"
                               hasVideo:NO
                    localizedCallerName:callerDisplay
                        supportsHolding:YES
                           supportsDTMF:NO
                       supportsGrouping:NO
                     supportsUngrouping:NO
                            fromPushKit:YES
                                payload:payload.dictionaryPayload
                  withCompletionHandler:^{
        [RNCallKeep endCallWithUUID:dummy reason:2];
        completion();
      }];
      return;
    }
    // Report (iOS 13+ requires it for EVERY VoIP push) with a throwaway
    // uuid, then end the RINGING call after a grace period — the cancel is
    // also sent when THIS device answers (multi-device dismissal), racing
    // the answer by milliseconds: ending immediately can kill the call the
    // user just answered. 2 = CXCallEndedReasonRemoteEnded.
    NSString *dummy2 = [[NSUUID UUID] UUIDString];
    [RNCallKeep reportNewIncomingCall:dummy2
                               handle:caller
                           handleType:@"number"
                             hasVideo:NO
                  localizedCallerName:callerDisplay
                      supportsHolding:YES
                         supportsDTMF:NO
                     supportsGrouping:NO
                   supportsUngrouping:NO
                          fromPushKit:YES
                              payload:payload.dictionaryPayload
                withCompletionHandler:^{
      [RNCallKeep endCallWithUUID:dummy2 reason:2];
      completion();
    }];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.5 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
      if (![RNCallKeep isCallActive:uuid] && ![RNCallKeep wasCallAnswered:uuid]) {
        [RNCallKeep endCallWithUUID:uuid reason:2];
      }
    });
  } else {
    [RNCallKeep reportNewIncomingCall:uuid
                               handle:caller
                           handleType:@"number"
                             hasVideo:hasVideo
                  localizedCallerName:callerDisplay
                      supportsHolding:YES
                         supportsDTMF:NO
                     supportsGrouping:NO
                   supportsUngrouping:NO
                          fromPushKit:YES
                              payload:payload.dictionaryPayload
                withCompletionHandler:completion];
    // Native ring-timeout backstop, just above the server's 35 s no-answer
    // cancel. iOS can park the JS thread after a background wake, so only
    // a native timer is guaranteed to fire if the device also went offline.
    // 3 = CXCallEndedReasonUnanswered (logged as a missed call).
    NSString *ringUuid = [uuid copy];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(40 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
      if (![RNCallKeep isCallActive:ringUuid]) {
        [RNCallKeep endCallWithUUID:ringUuid reason:3];
      }
    });
  }

  [RNVoipPushNotificationManager didReceiveIncomingPushWithPayload:payload forType:(NSString *)type];
}

@end
