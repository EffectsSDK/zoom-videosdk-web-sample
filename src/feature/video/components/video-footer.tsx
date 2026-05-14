import { useState, useCallback, useContext, useEffect, useRef } from 'react';
import classNames from 'classnames';
import { message, Modal, Form, Select, Checkbox, Tooltip } from 'antd';
import { useSearchParams } from 'react-router';
import { SoundOutlined } from '@ant-design/icons';
import ZoomContext from '../../../context/zoom-context';
import CameraButton from './camera';
import MicrophoneButton from './microphone';
import { ScreenShareButton } from './screen-share';
import AudioVideoStatisticModal from './audio-video-statistic';
import ZoomMediaContext from '../../../context/media-context';
import { useUnmount, useMount } from '../../../hooks';
import type { MediaDevice } from '../video-types';
import './video-footer.scss';
import { isAndroidOrIOSBrowser } from '../../../utils/platform';
import { getPhoneCallStatusDescription } from '../video-constants';
import { type RecordButtonProps, getRecordingButtons, RecordingButton } from './recording';
import {
  type DialOutOption,
  type Processor,
  type ProcessorParams,
  DialoutState,
  RecordingStatus,
  MutedSource,
  AudioChangeAction,
  SharePrivilege,
  MobileVideoFacingMode,
  LiveStreamStatus,
  ShareStatus,
  BroadcastStreamingStatus
} from '@zoom/videosdk';
import { LiveTranscriptionButton } from './live-transcription';
import { LeaveButton } from './leave';
import { TranscriptionSubtitle } from './transcription-subtitle';
import IsoRecordingModal from './recording-ask-modal';
import { LiveStreamButton, LiveStreamModal } from './live-stream';
import { IconFont } from '../../../component/icon-font';
import { VideoMaskModel } from './video-mask-modal';
import { useParticipantsChange } from '../hooks/useParticipantsChange';
import { tsvb } from 'effects-sdk';
import appPackageJson from '../../../../package.json';
interface VideoFooterProps {
  className?: string;
  selfShareCanvas?: HTMLCanvasElement | HTMLVideoElement | null;
  sharing?: boolean;
}

const isAudioEnable = typeof AudioWorklet === 'function';
const processorBaseUrl = `${location.origin}/processors`;
const effectsSdkVersion = appPackageJson.dependencies['effects-sdk'].replace(/^[^\d]*/, '');
type EffectsSdkInstance = InstanceType<typeof tsvb>;

const VideoFooter = (props: VideoFooterProps) => {
  const { className, selfShareCanvas, sharing } = props;
  const zmClient = useContext(ZoomContext);
  const { mediaStream } = useContext(ZoomMediaContext);
  const effectsSDKRef = useRef<EffectsSdkInstance | null>(null);
  const effectsChannelRef = useRef<MessageChannel | null>(null);
  const effectsLowerThirdRef = useRef<any>(null);
  const effectsSessionRef = useRef(0);
  const liveTranscriptionClient = zmClient.getLiveTranscriptionClient();
  const liveStreamClient = zmClient.getLiveStreamClient();
  const broadcastStreamClient = zmClient.getBroadcastStreamingClient();
  const recordingClient = zmClient.getRecordingClient();
  const [isStartedAudio, setIsStartedAudio] = useState(
    zmClient.getCurrentUserInfo() && zmClient.getCurrentUserInfo().audio !== ''
  );
  const [isStartedVideo, setIsStartedVideo] = useState(zmClient.getCurrentUserInfo()?.bVideoOn);
  const [audio, setAudio] = useState(zmClient.getCurrentUserInfo()?.audio);
  const [isSupportPhone, setIsSupportPhone] = useState(false);
  const [phoneCountryList, setPhoneCountryList] = useState<any[]>([]);
  const [phoneCallStatus, setPhoneCallStatus] = useState<DialoutState>();
  const [isBlur, setIsBlur] = useState(mediaStream?.getVirtualbackgroundStatus().imageSrc === 'blur');
  const [isMuted, setIsMuted] = useState(!!zmClient.getCurrentUserInfo()?.muted);
  const [activeMicrophone, setActiveMicrophone] = useState(mediaStream?.getActiveMicrophone());
  const [activeSpeaker, setActiveSpeaker] = useState(mediaStream?.getActiveSpeaker());
  const [activeCamera, setActiveCamera] = useState(mediaStream?.getActiveCamera());
  const [micList, setMicList] = useState<MediaDevice[]>(mediaStream?.getMicList() ?? []);
  const [speakerList, setSpeakerList] = useState<MediaDevice[]>(mediaStream?.getSpeakerList() ?? []);
  const [cameraList, setCameraList] = useState<MediaDevice[]>(mediaStream?.getCameraList() ?? []);
  const [statisticVisible, setStatisticVisible] = useState(false);
  const [selecetedStatisticTab, setSelectedStatisticTab] = useState('audio');
  const [isComputerAudioDisabled, setIsComputerAudioDisabled] = useState(false);
  const [sharePrivilege, setSharePrivileg] = useState(SharePrivilege.Unlocked);
  const [caption, setCaption] = useState({ text: '', isOver: false, displayName: '' });
  const [activePlaybackUrl, setActivePlaybackUrl] = useState('');
  const [activeVideoProcessor, setActiveVideoProcessor] = useState<Processor | undefined>();
  const [activeEffectType, setActiveEffectType] = useState<string | undefined>();
  const [activeAudioProcessorList, setActiveAudioProcessorList] = useState<Processor[]>([]);
  const [isMicrophoneForbidden, setIsMicrophoneForbidden] = useState(false);
  const [createdProcessorList, setCreatedProcessorList] = useState<Processor[]>([]);
  const [recordingStatus, setRecordingStatus] = useState<'' | RecordingStatus>(
    recordingClient?.getCloudRecordingStatus() || ''
  );
  const [recordingIsoStatus, setRecordingIsoStatus] = useState<'' | RecordingStatus>('');
  const [liveStreamVisible, setLiveStreamVisible] = useState(false);
  const [liveStreamStatus, setLiveStreamStatus] = useState(liveStreamClient?.getLiveStreamStatus());
  const [broadcastStreamStatus, setBroadcastStreamStatus] = useState<'' | BroadcastStreamingStatus>(
    broadcastStreamClient.getBroadcastStreamingStatus()?.status
  );
  // Video Mask
  const [videoMaskVisible, setVideoMaskVisible] = useState(false);
  const [isSupportVideoProcessor, setIsSupportVideoProcessor] = useState(false);
  const [isSupportAudioProcessor, setIsSupportAudioProcessor] = useState(false);
  const [isSecondaryAudioStarted, setIsSecondaryAudioStarted] = useState(false);
  const [isVideoMirrored, setIsVideoMirrored] = useState<boolean>(!!mediaStream?.isVideoMirrored());

  const [secondaryMicForm] = Form.useForm();
  const [searchParams] = useSearchParams();
  const audioProcessorList: Array<ProcessorParams> = [
    {
      url: `${processorBaseUrl}/bypass-audio-processor.js`,
      type: 'audio',
      name: 'bypass-audio-processor',
      options: {}
    },
    {
      url: `${processorBaseUrl}/white-noise-audio-processor.js`,
      type: 'audio',
      name: 'white-noise-audio-processor',
      options: {}
    },
    {
      url: `${processorBaseUrl}/pitch-shift-audio-processor.js`,
      type: 'audio',
      name: 'pitch-shift-audio-processor',
      options: {}
    }
  ];
  useParticipantsChange(zmClient, () => {
    const currentUser = zmClient.getCurrentUserInfo();
    setIsMuted(!!currentUser?.muted);
    setIsStartedVideo(!!currentUser?.bVideoOn);
  });
  const onCameraClick = useCallback(async () => {
    if (isStartedVideo) {
      await mediaStream?.stopVideo();
      if (activePlaybackUrl) {
        await mediaStream?.switchMicrophone('default');
        setActiveMicrophone(mediaStream?.getActiveMicrophone());
        setActivePlaybackUrl('');
      }
    } else {
      const startVideoOptions = {
        hd: true,
        fullHd: true,
        ptz: mediaStream?.isBrowserSupportPTZ(),
        originalRatio: true
      };
      if (mediaStream?.isSupportVirtualBackground() && isBlur) {
        Object.assign(startVideoOptions, { virtualBackground: { imageUrl: 'blur' } });
      }
      await mediaStream?.startVideo(startVideoOptions);
    }
  }, [mediaStream, isStartedVideo, isBlur, activePlaybackUrl]);
  const onMicrophoneClick = useCallback(async () => {
    if (isStartedAudio) {
      if (isMuted) {
        await mediaStream?.unmuteAudio();
      } else {
        await mediaStream?.muteAudio();
      }
    } else {
      try {
        if (activePlaybackUrl) {
          await mediaStream?.startAudio({ mediaFile: { url: activePlaybackUrl, loop: true } });
        } else {
          await mediaStream?.startAudio({ highBitrate: true });
        }
        setActiveMicrophone(mediaStream?.getActiveMicrophone());
      } catch (e: any) {
        if (e.type === 'INSUFFICIENT_PRIVILEGES' && e.reason === 'USER_FORBIDDEN_MICROPHONE') {
          setIsMicrophoneForbidden(true);
        }
        console.warn(e);
      }
      // setIsStartedAudio(true);
    }
  }, [mediaStream, isStartedAudio, isMuted, activePlaybackUrl]);
  const onMicrophoneMenuClick = async (key: string) => {
    if (mediaStream) {
      const [type, deviceId] = key.split('|');
      if (type === 'microphone') {
        if (deviceId !== activeMicrophone) {
          await mediaStream.switchMicrophone(deviceId);
          setActiveMicrophone(mediaStream.getActiveMicrophone());
        }
      } else if (type === 'speaker') {
        if (deviceId !== activeSpeaker) {
          await mediaStream.switchSpeaker(deviceId);
          setActiveSpeaker(mediaStream.getActiveSpeaker());
        }
      } else if (type === 'leave audio') {
        if (audio === 'computer') {
          await mediaStream.stopAudio();
          setIsMicrophoneForbidden(false);
        } else if (audio === 'phone') {
          await mediaStream.hangup();
          setPhoneCallStatus(undefined);
        }
      } else if (type === 'statistic') {
        setSelectedStatisticTab('audio');
        setStatisticVisible(true);
      } else if (type === 'secondary audio') {
        if (isSecondaryAudioStarted) {
          await mediaStream.stopSecondaryAudio();
          setIsSecondaryAudioStarted(false);
        } else {
          const selectedMic = secondaryMicForm.getFieldValue('mic');
          if (!mediaStream.getMicList().some((item) => item.deviceId === selectedMic)) {
            secondaryMicForm.setFieldValue('mic', undefined);
          }
          Modal.confirm({
            title: 'Start secondary audio',
            content: (
              <Form form={secondaryMicForm}>
                <Form.Item label="Microphone" name="mic" required>
                  <Select
                    options={mediaStream.getMicList().map((item) => ({
                      value: item.deviceId,
                      label: item.label,
                      disabled:
                        item.deviceId === mediaStream.getActiveMicrophone() ||
                        item.label ===
                          mediaStream.getMicList()?.find((item) => item.deviceId === mediaStream.getActiveMicrophone())
                            ?.label
                    }))}
                  />
                </Form.Item>
                <Form.Item label="Contraintes" name="constraints">
                  <Checkbox.Group
                    options={[
                      { label: 'AGC', value: 'autoGainControl' },
                      {
                        label: 'ANC',
                        value: 'noiseSuppression'
                      },
                      {
                        label: 'AEC',
                        value: 'echoCancellation'
                      }
                    ]}
                  />
                </Form.Item>
              </Form>
            ),
            onOk: async () => {
              try {
                const data = await secondaryMicForm.validateFields();
                const { mic, constraints } = data;
                const option = { autoGainControl: false, noiseSuppression: false, echoCancellation: false };
                if (constraints) {
                  constraints.forEach((key: string) => {
                    Object.assign(option, { [`${key}`]: true });
                  });
                }
                await mediaStream.startSecondaryAudio(mic, option);
                setIsSecondaryAudioStarted(true);
              } catch (e) {
                console.warn(e);
              }
            }
          });
        }
      } else if (type === 'processor') {
        const [, processorName] = key.split('|');
        const processor = audioProcessorList.find((item) => item.name === processorName);
        if (processor && mediaStream) {
          try {
            let tempProcessor =
              createdProcessorList?.find((p) => p.name === processorName) ||
              (await mediaStream.createProcessor(processor));
            setCreatedProcessorList([...createdProcessorList, tempProcessor]);

            let index = activeAudioProcessorList.findIndex((p) => p.name === processorName);
            if (index > -1) {
              await mediaStream?.removeProcessor(tempProcessor);
              setActiveAudioProcessorList(activeAudioProcessorList.filter((p) => p.name !== processorName));
            } else {
              await mediaStream?.addProcessor(tempProcessor);
              setActiveAudioProcessorList([...activeAudioProcessorList, tempProcessor]);
            }
            tempProcessor.port.postMessage({ cmd: 'update', data: '6666' });
            tempProcessor.port.onmessage = ({ data: { cmd: __cmd, data } }) => {
              console.log('main thread received data:', data);
            };
          } catch (e) {
            console.error(e);
          }
        }
      }
    }
  };
  const onSwitchCamera = async (key: string) => {
    if (mediaStream) {
      if (activeCamera !== key) {
        await mediaStream.switchCamera(key);
        setActiveCamera(mediaStream.getActiveCamera());
        if (activePlaybackUrl) {
          await mediaStream.switchMicrophone('default');
          setActiveMicrophone(mediaStream.getActiveMicrophone());
          setActivePlaybackUrl('');
        }
      }
    }
  };
  const onMirrorVideo = async () => {
    await mediaStream?.mirrorVideo(!mediaStream.isVideoMirrored());
    setIsVideoMirrored(!!mediaStream?.isVideoMirrored());
  };
  const onBlurBackground = async () => {
    try {
      const isSupportVirtualBackground = mediaStream?.isSupportVirtualBackground();
      if (isSupportVirtualBackground) {
        if (isBlur) {
          await mediaStream?.updateVirtualBackgroundImage(undefined);
        } else {
          await mediaStream?.updateVirtualBackgroundImage('blur');
        }
      } else {
        setVideoMaskVisible(true);
      }

      setIsBlur(!isBlur);
    } catch (e) {
      console.error(e);
    }
  };
  const onPhoneCall = async (code: string, phoneNumber: string, name: string, option: DialOutOption) => {
    await mediaStream?.inviteByPhone(code, phoneNumber, name, option);
  };
  const onPhoneCallCancel = async (code: string, phoneNumber: string, option: { callMe: boolean }) => {
    if ([DialoutState.Calling, DialoutState.Ringing, DialoutState.Accepted].includes(phoneCallStatus as any)) {
      await mediaStream?.cancelInviteByPhone(code, phoneNumber, option);
      await new Promise((resolve) => {
        setTimeout(() => {
          resolve(true);
        }, 3000);
      });
    }
    return Promise.resolve();
  };
  const onHostAudioMuted = useCallback(
    (payload: any) => {
      const { action, source, type } = payload;
      const currentUser = zmClient.getCurrentUserInfo();
      setIsStartedAudio(currentUser.audio === 'computer' || currentUser.audio === 'phone');
      setAudio(currentUser.audio);
      if (action === AudioChangeAction.Join) {
        setIsStartedAudio(true);
        setAudio(type);
      } else if (action === AudioChangeAction.Leave) {
        setIsStartedAudio(false);
      } else if (action === AudioChangeAction.Muted) {
        if (source === MutedSource.PassiveByMuteOne) {
          message.info('Host muted you');
        }
      } else if (action === AudioChangeAction.Unmuted) {
        if (source === 'passive') {
          message.info('Host unmuted you');
        }
      }
    },
    [zmClient]
  );
  const onScreenShareClick = useCallback(async () => {
    if (mediaStream?.getShareStatus() === ShareStatus.End && selfShareCanvas) {
      await mediaStream?.startShareScreen(selfShareCanvas, {
        requestReadReceipt: true,
        simultaneousShareView: searchParams.get('simultaneousShareView') === '1'
      });
    }
  }, [mediaStream, selfShareCanvas, searchParams]);

  const onLeaveClick = useCallback(async () => {
    await zmClient.leave();
  }, [zmClient]);

  const onEndClick = useCallback(async () => {
    await zmClient.leave(true);
  }, [zmClient]);

  const onPassivelyStopShare = useCallback(({ reason }: any) => {
    console.log('passively stop reason:', reason);
  }, []);
  const onDeviceChange = useCallback(() => {
    if (mediaStream) {
      setMicList(mediaStream.getMicList());
      setSpeakerList(mediaStream.getSpeakerList());
      if (!isAndroidOrIOSBrowser()) {
        setCameraList(mediaStream.getCameraList());
      }
      setActiveMicrophone(mediaStream.getActiveMicrophone());
      setActiveSpeaker(mediaStream.getActiveSpeaker());
      setActiveCamera(mediaStream.getActiveCamera());
    }
  }, [mediaStream]);

  const onRecordingChange = useCallback(() => {
    setRecordingStatus(recordingClient?.getCloudRecordingStatus() || '');
  }, [recordingClient]);

  const onRecordingISOChange = useCallback(
    (payload: any) => {
      if (payload?.userId === zmClient.getSessionInfo().userId || payload?.status === RecordingStatus.Ask) {
        setRecordingIsoStatus(payload?.status);
      }
      console.log('recording-iso-change', payload);
    },
    [zmClient]
  );

  const onDialOutChange = useCallback((payload: any) => {
    setPhoneCallStatus(payload.code);
  }, []);

  const onRecordingClick = async (key: string) => {
    switch (key) {
      case 'Record': {
        await recordingClient?.startCloudRecording();
        break;
      }
      case 'Resume': {
        await recordingClient?.resumeCloudRecording();
        break;
      }
      case 'Stop': {
        await recordingClient?.stopCloudRecording();
        break;
      }
      case 'Pause': {
        await recordingClient?.pauseCloudRecording();
        break;
      }
      case 'Status': {
        break;
      }
      default: {
        await recordingClient?.startCloudRecording();
      }
    }
  };
  const onShareAudioChange = useCallback(
    (payload: any) => {
      const { state } = payload;
      if (state === 'on') {
        if (!mediaStream?.isSupportMicrophoneAndShareAudioSimultaneously()) {
          setIsComputerAudioDisabled(true);
        }
      } else if (state === 'off') {
        setIsComputerAudioDisabled(false);
      }
    },
    [mediaStream]
  );
  const onHostAskToUnmute = useCallback(
    (payload: any) => {
      const { reason } = payload;
      Modal.confirm({
        title: 'Unmute audio',
        content: `Host ask to unmute audio, reason: ${reason}`,
        onOk: async () => {
          await mediaStream?.unmuteAudio();
        },
        onCancel() {
          console.log('cancel');
        }
      });
    },
    [mediaStream]
  );

  const onCaptionMessage = useCallback((payload: any) => {
    const { text, done, displayName } = payload;
    setCaption({
      text,
      isOver: done,
      displayName
    });
  }, []);

  const onCanSeeMyScreen = useCallback(() => {
    message.info('Users can now see your screen', 1);
  }, []);
  const onSelectVideoPlayback = useCallback(
    async (url: string) => {
      if (activePlaybackUrl !== url) {
        await mediaStream?.switchCamera({ url, loop: true });
        if (isStartedAudio) {
          await mediaStream?.switchMicrophone({ url, loop: true });
        } else {
          await mediaStream?.startAudio({ mediaFile: { url, loop: true } });
        }
        setActivePlaybackUrl(url);
      }
    },
    [isStartedAudio, activePlaybackUrl, mediaStream]
  );

  const updateWatermarkImage = useCallback((processor: Processor, imageUrl: string) => {
    const img = document.createElement('img');
    img.width = 640;
    img.height = 360;
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => {
      createImageBitmap(img).then((ibm) => {
        processor?.port?.postMessage({
          cmd: 'update_watermark_image',
          data: ibm
        });
      });
    };
  }, []);

  const destroyLowerThird = useCallback(() => {
    try {
      effectsLowerThirdRef.current?.hide?.();
      effectsLowerThirdRef.current?.destroy?.();
    } catch (error) {
      console.warn('Failed to destroy lower third component:', error);
    } finally {
      effectsLowerThirdRef.current = null;
    }
  }, []);

  const destroyEffectsSdk = useCallback(
    async (processor?: Processor) => {
      effectsSessionRef.current += 1;
      processor?.port.postMessage({ cmd: 'stop' });
      processor?.port.postMessage({ cmd: 'reset' });

      const channel = effectsChannelRef.current;
      effectsChannelRef.current = null;
      channel?.port1.close();
      channel?.port2.close();

      destroyLowerThird();

      const sdk = effectsSDKRef.current;
      effectsSDKRef.current = null;
      if (sdk) {
        try {
          sdk.stop?.();
        } catch (error) {
          console.warn('Failed to stop Effects SDK:', error);
        }
        try {
          await sdk.destroy?.();
        } catch (error) {
          console.warn('Failed to destroy Effects SDK:', error);
        }
      }
    },
    [destroyLowerThird]
  );

  const applyEffect = useCallback((sdk: EffectsSdkInstance, effectType: string) => {
    sdk.clearBlur();
    sdk.clearBackground();
    sdk.disableBeautification();
    destroyLowerThird();

    switch (effectType) {
      case 'esdk-blur':
        sdk.setBlur(0.8);
        console.log('Applying blur effect');
        break;

      case 'esdk-beautification':
        sdk.enableBeautification();
        sdk.setBeautificationLevel(1);
        console.log('Applying beautification effect');
        break;

      case 'esdk-image':
        sdk.setBackground('https://effectssdk.ai/sdk/100.jpg', { type: 'image/jpeg' });
        console.log('Applying background image effect');
        break;

      case 'esdk-video':
        sdk.setBackground('https://effectssdk.ai/sdk/video-background.mp4', { type: 'video/mp4' });
        console.log('Applying background video effect');
        break;

      case 'esdk-lowerthird': {
        const lowerThirdComponent = sdk.createComponent({
          component: 'lowerthird_2',
          options: {
            text: {
              title: 'Max Trosin',
              subtitle: 'Effects SDK Team'
            }
          }
        });

        sdk.addComponent(lowerThirdComponent, 'lower_third');
        lowerThirdComponent.show();
        effectsLowerThirdRef.current = lowerThirdComponent;
        console.log('Applying lower third effect');
        break;
      }

      default:
        console.warn('Unknown effect type:', effectType);
    }
  }, [destroyLowerThird]);

  const updateEffect = useCallback((effectType: string) => {
    const effectsSDK = effectsSDKRef.current;
    if (!effectsSDK) {
      console.warn('Effects SDK is not initialized');
      return;
    }

    applyEffect(effectsSDK, effectType);
    setActiveEffectType(effectType);
  }, [applyEffect]);

  const initializeEffectsSDK = useCallback(async (processor: Processor, effectType: string) => {
    try {
      await destroyEffectsSdk(processor);

      const sdk = new tsvb('CUSTOMER_ID');
      const sessionId = effectsSessionRef.current + 1;
      effectsSessionRef.current = sessionId;

      sdk.config({
        preset: 'balanced',
        provider: 'webgpu',
        test_inference: true,
        wasmPaths: {
          'ort-wasm.wasm': `https://effectssdk.ai/sdk/web/${effectsSdkVersion}/ort-wasm.wasm`,
          'ort-wasm-simd.wasm': `https://effectssdk.ai/sdk/web/${effectsSdkVersion}/ort-wasm-simd.wasm`
        }
      });
      sdk.onError((error) => {
        console.error('Effects SDK error:', error);
      });

      await sdk.initFrameProcessor();
      if (sessionId !== effectsSessionRef.current) {
        await sdk.destroy?.();
        return false;
      }

      sdk.run();
      effectsSDKRef.current = sdk;

      const channel = new MessageChannel();
      effectsChannelRef.current = channel;

      processor.port.postMessage(
        {
          cmd: 'initialize',
          port: channel.port1
        },
        [channel.port1]
      );

      channel.port2.start();
      channel.port2.onmessage = async (e) => {
        if (sessionId !== effectsSessionRef.current || e.data.cmd !== 'process_frame') {
          e.data.frame?.close?.();
          return;
        }

        const { frame, frameId } = e.data;

        try {
          const outputFrame = await sdk.processFrame(frame);
          if (sessionId !== effectsSessionRef.current) {
            outputFrame.close();
            return;
          }

          channel.port2.postMessage(
            {
              cmd: 'processed_video_frame',
              frame: outputFrame,
              frameId
            },
            [outputFrame]
          );
        } catch (err) {
          console.error('Frame processing failed:', err);
          channel.port2.postMessage({
            cmd: 'processed_video_frame',
            frame: null,
            frameId,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      };

      processor.port.postMessage({ cmd: 'start' });
      applyEffect(sdk, effectType);
      setActiveEffectType(effectType);

      console.log('Effects SDK initialized with effect:', effectType);
      return true;
    } catch (error) {
      console.error('Failed to initialize Effects SDK:', error);
      await destroyEffectsSdk(processor);
      return false;
    }
  }, [applyEffect, destroyEffectsSdk]);

  const onVideoProcessorClick = useCallback(async (processor: any) => {
    if (
      processor.name === 'effects-sdk-processor' &&
      activeVideoProcessor?.name === 'effects-sdk-processor' &&
      processor.effectType &&
      processor.effectType !== activeEffectType
    ) {
      updateEffect(processor.effectType);
      return;
    }

    let tempProcessor = createdProcessorList?.find((p) => p.name === processor.name);
    if (!tempProcessor) {
      try {
        tempProcessor = await mediaStream?.createProcessor(processor);
        if (tempProcessor) {
          setCreatedProcessorList((prev) =>
            prev.some((item) => item.name === tempProcessor?.name) ? prev : [...prev, tempProcessor as Processor]
          );
        }
      } catch (e) {
        console.log(e);
        return;
      }
    }
    if (!tempProcessor) {
      return;
    }

    try {
      if (activeVideoProcessor?.name === tempProcessor.name) {
        await mediaStream?.removeProcessor(tempProcessor);
        if (tempProcessor.name === 'effects-sdk-processor') {
          await destroyEffectsSdk(tempProcessor);
        }
        setActiveVideoProcessor(undefined);
        setActiveEffectType(undefined);
        return;
      }

      if (activeVideoProcessor) {
        await mediaStream?.removeProcessor(activeVideoProcessor);
        if (activeVideoProcessor.name === 'effects-sdk-processor') {
          await destroyEffectsSdk(activeVideoProcessor);
        }
        setActiveVideoProcessor(undefined);
      }

      await mediaStream?.addProcessor(tempProcessor);
      if (tempProcessor.name === 'watermark-processor') {
        updateWatermarkImage(tempProcessor, `${location.origin}/zoom.svg`);
        setActiveEffectType(undefined);
      } else if (tempProcessor.name === 'effects-sdk-processor') {
        const effectType = processor.effectType || 'esdk-blur';
        const initialized = await initializeEffectsSDK(tempProcessor, effectType);
        if (!initialized) {
          await mediaStream?.removeProcessor(tempProcessor);
          setActiveEffectType(undefined);
          return;
        }
      } else {
        setActiveEffectType(undefined);
      }

      setActiveVideoProcessor(tempProcessor);
    } catch (e) {
      console.error(e);
    }
  }, [createdProcessorList, mediaStream, activeVideoProcessor, activeEffectType, destroyEffectsSdk, updateWatermarkImage, initializeEffectsSDK, updateEffect]);
  const onLiveStreamClick = useCallback(() => {
    if (liveStreamStatus === LiveStreamStatus.Ended) {
      setLiveStreamVisible(true);
    } else if (liveStreamStatus === LiveStreamStatus.InProgress) {
      liveStreamClient?.stopLiveStream();
    }
  }, [liveStreamStatus, liveStreamClient]);
  const onBroadcastStreamClick = useCallback(() => {
    if (broadcastStreamStatus === BroadcastStreamingStatus.InProgress) {
      broadcastStreamClient.stopBroadcast();
    } else {
      broadcastStreamClient.startBroadcast();
    }
  }, [broadcastStreamStatus, broadcastStreamClient]);
  const onLiveStreamStatusChange = useCallback((status: any) => {
    setLiveStreamStatus(status);
    if (status === LiveStreamStatus.Timeout) {
      message.error('Start live streaming timeout');
    }
  }, []);
  const onBroadcastStreamStatusChange = useCallback((payload: any) => {
    setBroadcastStreamStatus(payload.status);
  }, []);
  const onVideoScreenshotTaken = useCallback((payload: any) => {
    const { displayName, userId } = payload;
    message.info(`${displayName}(User:${userId}) just took a screenshot of your video`);
  }, []);
  const onShareViewScreenshotTaken = useCallback((payload: any) => {
    const { displayName, userId } = payload;
    message.info(`${displayName}(User:${userId}) just took a screenshot of your sharing`);
  }, []);
  useEffect(() => {
    zmClient.on('current-audio-change', onHostAudioMuted);
    zmClient.on('passively-stop-share', onPassivelyStopShare);
    zmClient.on('device-change', onDeviceChange);
    zmClient.on('recording-change', onRecordingChange);
    zmClient.on('individual-recording-change', onRecordingISOChange);
    zmClient.on('dialout-state-change', onDialOutChange);
    zmClient.on('share-audio-change', onShareAudioChange);
    zmClient.on('host-ask-unmute-audio', onHostAskToUnmute);
    zmClient.on('caption-message', onCaptionMessage);
    zmClient.on('share-can-see-screen', onCanSeeMyScreen);
    zmClient.on('live-stream-status', onLiveStreamStatusChange);
    zmClient.on('video-screenshot-taken', onVideoScreenshotTaken);
    zmClient.on('share-content-screenshot-taken', onShareViewScreenshotTaken);
    zmClient.on('broadcast-streaming-status', onBroadcastStreamStatusChange);
    return () => {
      zmClient.off('current-audio-change', onHostAudioMuted);
      zmClient.off('passively-stop-share', onPassivelyStopShare);
      zmClient.off('device-change', onDeviceChange);
      zmClient.off('recording-change', onRecordingChange);
      zmClient.off('individual-recording-change', onRecordingISOChange);
      zmClient.off('dialout-state-change', onDialOutChange);
      zmClient.off('share-audio-change', onShareAudioChange);
      zmClient.off('host-ask-unmute-audio', onHostAskToUnmute);
      zmClient.off('caption-message', onCaptionMessage);
      zmClient.off('share-can-see-screen', onCanSeeMyScreen);
      zmClient.off('live-stream-status', onLiveStreamStatusChange);
      zmClient.off('video-screenshot-taken', onVideoScreenshotTaken);
      zmClient.off('share-content-screenshot-taken', onShareViewScreenshotTaken);
      zmClient.off('broadcast-streaming-status', onBroadcastStreamStatusChange);
    };
  }, [
    zmClient,
    onHostAudioMuted,
    onPassivelyStopShare,
    onDeviceChange,
    onRecordingChange,
    onDialOutChange,
    onShareAudioChange,
    onHostAskToUnmute,
    onCaptionMessage,
    onCanSeeMyScreen,
    onRecordingISOChange,
    onLiveStreamStatusChange,
    onVideoScreenshotTaken,
    onShareViewScreenshotTaken,
    onBroadcastStreamStatusChange
  ]);
  useUnmount(() => {
    if (zmClient.getSessionInfo().isInMeeting) {
      if (isStartedAudio) {
        mediaStream?.stopAudio();
      }
      if (isStartedVideo) {
        mediaStream?.stopVideo();
      }
      mediaStream?.stopShareScreen();
    }
    if (activeVideoProcessor?.name === 'effects-sdk-processor') {
      void destroyEffectsSdk(activeVideoProcessor);
    }
  });
  useMount(() => {
    if (mediaStream) {
      setIsSupportPhone(!!mediaStream.isSupportPhoneFeature());
      setPhoneCountryList(mediaStream.getSupportCountryInfo() || []);
      setSharePrivileg(mediaStream.getSharePrivilege());
      setIsSupportVideoProcessor(mediaStream.isSupportVideoProcessor());
      setIsSupportAudioProcessor(mediaStream.isSupportAudioProcessor());
      if (isAndroidOrIOSBrowser()) {
        setCameraList([
          { deviceId: MobileVideoFacingMode.User, label: 'Front-facing' },
          { deviceId: MobileVideoFacingMode.Environment, label: 'Rear-facing' }
        ]);
      }
    }
  });
  useEffect(() => {
    if (mediaStream && zmClient.getSessionInfo().isInMeeting && statisticVisible) {
      mediaStream.subscribeAudioStatisticData();
      mediaStream.subscribeVideoStatisticData();
      mediaStream.subscribeShareStatisticData();
    }
    return () => {
      if (zmClient.getSessionInfo().isInMeeting) {
        mediaStream?.unsubscribeAudioStatisticData();
        mediaStream?.unsubscribeVideoStatisticData();
        mediaStream?.unsubscribeShareStatisticData();
      }
    };
  }, [mediaStream, zmClient, statisticVisible]);
  const recordingButtons: RecordButtonProps[] = getRecordingButtons(recordingStatus, zmClient.isHost());
  return (
    <div className={classNames('video-footer', className)}>
      {isAudioEnable && (
        <MicrophoneButton
          isStartedAudio={isStartedAudio}
          isMuted={isMuted}
          isSupportPhone={isSupportPhone}
          audio={audio}
          phoneCountryList={phoneCountryList}
          onPhoneCallClick={onPhoneCall}
          onPhoneCallCancel={onPhoneCallCancel}
          phoneCallStatus={getPhoneCallStatusDescription(phoneCallStatus)}
          onMicrophoneClick={onMicrophoneClick}
          onMicrophoneMenuClick={onMicrophoneMenuClick}
          audioProcessorList={audioProcessorList}
          microphoneList={micList}
          speakerList={speakerList}
          activeMicrophone={activeMicrophone}
          activeSpeaker={activeSpeaker}
          disabled={isComputerAudioDisabled}
          isMicrophoneForbidden={isMicrophoneForbidden}
          isSecondaryAudioStarted={isSecondaryAudioStarted}
          isSupportAudioProcessor={isSupportAudioProcessor}
          activeAudioProcessorList={activeAudioProcessorList}
        />
      )}
      <CameraButton
        isStartedVideo={isStartedVideo}
        onCameraClick={onCameraClick}
        onSwitchCamera={onSwitchCamera}
        onMirrorVideo={onMirrorVideo}
        onSelectVideoProcessor={onVideoProcessorClick}
        onVideoStatistic={() => {
          setSelectedStatisticTab('video');
          setStatisticVisible(true);
        }}
        onBlurBackground={onBlurBackground}
        onSelectVideoPlayback={onSelectVideoPlayback}
        activePlaybackUrl={activePlaybackUrl}
        activeProcessor={activeEffectType || activeVideoProcessor?.name}
        cameraList={cameraList}
        activeCamera={activeCamera}
        isMirrored={isVideoMirrored}
        isBlur={isBlur}
        isSupportVideoProcessor={isSupportVideoProcessor}
      />
      {sharing && (
        <ScreenShareButton
          sharePrivilege={sharePrivilege}
          isHostOrManager={zmClient.isHost() || zmClient.isManager()}
          onScreenShareClick={onScreenShareClick}
          onSharePrivilegeClick={async (privilege) => {
            await mediaStream?.setSharePrivilege(privilege);
            setSharePrivileg(privilege);
          }}
        />
      )}
      {!zmClient?.getCurrentUserInfo()?.subsessionId &&
        recordingButtons.map((button: RecordButtonProps) => {
          return (
            <RecordingButton
              key={button.text}
              onClick={() => {
                onRecordingClick(button.text);
              }}
              {...button}
            />
          );
        })}
      {liveTranscriptionClient?.getLiveTranscriptionStatus().isLiveTranscriptionEnabled && (
        <>
          <LiveTranscriptionButton isHost={zmClient.isHost()} />
          <TranscriptionSubtitle text={caption.text} displayName={caption.displayName} />
        </>
      )}
      {/* Live stream */}
      {/* {liveStreamClient?.isLiveStreamEnabled() && zmClient.isHost() && (
        <>
          <LiveStreamButton
            isLiveStreamOn={liveStreamStatus === LiveStreamStatus.InProgress}
            onLiveStreamClick={onLiveStreamClick}
          />
          <LiveStreamModal
            visible={liveStreamVisible}
            setVisible={setLiveStreamVisible}
            onStartLiveStream={(streanUrl: string, streamKey: string, broadcastUrl: string) => {
              liveStreamClient.startLiveStream(streanUrl, streamKey, broadcastUrl);
            }}
          />
        </>
      )}
      {liveStreamStatus === LiveStreamStatus.InProgress && (
        <IconFont type="icon-live" style={{ position: 'fixed', top: '45px', left: '10px', color: '#f00' }} />
      )} */}
      {/** Broadcast streaming */}
      {broadcastStreamClient.isBroadcastStreamingEnable() && zmClient.isHost() && (
        <LiveStreamButton
          isLiveStreamOn={broadcastStreamStatus === BroadcastStreamingStatus.InProgress}
          onLiveStreamClick={onBroadcastStreamClick}
        />
      )}
      {broadcastStreamStatus === BroadcastStreamingStatus.InProgress && (
        <IconFont type="icon-live" style={{ position: 'fixed', top: '45px', left: '10px', color: '#f00' }} />
      )}
      {isSecondaryAudioStarted && (
        <Tooltip title="Secondary audio on">
          <SoundOutlined style={{ position: 'fixed', top: '45px', left: '10px', color: '#f60', fontSize: '24px' }} />
        </Tooltip>
      )}
      <LeaveButton onLeaveClick={onLeaveClick} isHost={zmClient.isHost()} onEndClick={onEndClick} />

      <AudioVideoStatisticModal
        visible={statisticVisible}
        setVisible={setStatisticVisible}
        defaultTab={selecetedStatisticTab}
        isStartedAudio={isStartedAudio}
        isMuted={isMuted}
        isStartedVideo={isStartedVideo}
      />

      {recordingIsoStatus === RecordingStatus.Ask && (
        <IsoRecordingModal
          onClick={() => {
            recordingClient?.acceptIndividualRecording();
          }}
          onCancel={() => {
            recordingClient?.declineIndividualRecording();
          }}
        />
      )}
      {!mediaStream?.isSupportVirtualBackground() && (
        <VideoMaskModel visible={videoMaskVisible} setVisible={setVideoMaskVisible} isMirrored={isVideoMirrored} />
      )}
    </div>
  );
};

export default VideoFooter;
