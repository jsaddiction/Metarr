import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../middleware/logging.js';
import { DatabaseConnection } from '../../types/database.js';

const execPromise = promisify(exec);

/**
 * FFprobe Service
 *
 * Extracts stream details from video files using FFprobe
 * Stores video, audio, and subtitle stream information in database
 *
 * Performance: ~30 seconds for large files (vs 272ms for hash)
 * Only run when video hash changes to minimize overhead
 */

export interface VideoStream {
  streamIndex: number;
  codecName?: string;
  codecLongName?: string;
  profile?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  fps?: number;
  bitRate?: number;
  pixFmt?: string;
  colorRange?: string;
  colorSpace?: string;
  colorTransfer?: string;
  colorPrimaries?: string;
  language?: string;
  title?: string;
  isDefault?: boolean;
  isForced?: boolean;
}

export interface AudioStream {
  streamIndex: number;
  codecName?: string;
  codecLongName?: string;
  profile?: string;
  channels?: number;
  channelLayout?: string;
  sampleRate?: number;
  bitRate?: number;
  language?: string;
  title?: string;
  isDefault?: boolean;
  isForced?: boolean;
}

export interface SubtitleStream {
  streamIndex?: number;
  codecName?: string;
  sourceType: 'embedded' | 'external';
  filePath?: string;
  language?: string;
  title?: string;
  isDefault?: boolean;
  isForced?: boolean;
  isSdh?: boolean;
}

export interface MediaInfo {
  duration?: number;
  fileSize?: number;
  videoStreams: VideoStream[];
  audioStreams: AudioStream[];
  subtitleStreams: SubtitleStream[];
}

/**
 * Extract media information from video file using FFprobe
 */
export async function extractMediaInfo(filePath: string): Promise<MediaInfo> {
  try {
    const startTime = Date.now();

    // Run FFprobe with JSON output
    const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`;

    const { stdout } = await execPromise(command);
    const data = JSON.parse(stdout);

    const videoStreams: VideoStream[] = [];
    const audioStreams: AudioStream[] = [];
    const subtitleStreams: SubtitleStream[] = [];

    // Extract file-level info
    const duration = data.format?.duration ? parseFloat(data.format.duration) : undefined;
    const fileSize = data.format?.size ? parseInt(data.format.size, 10) : undefined;

    // Process each stream
    if (data.streams && Array.isArray(data.streams)) {
      for (const stream of data.streams) {
        if (stream.codec_type === 'video') {
          videoStreams.push(extractVideoStream(stream));
        } else if (stream.codec_type === 'audio') {
          audioStreams.push(extractAudioStream(stream));
        } else if (stream.codec_type === 'subtitle') {
          subtitleStreams.push(extractSubtitleStream(stream));
        }
      }
    }

    const timeMs = Date.now() - startTime;

    logger.debug('Extracted media info via FFprobe', {
      filePath,
      duration,
      fileSize,
      videoStreams: videoStreams.length,
      audioStreams: audioStreams.length,
      subtitleStreams: subtitleStreams.length,
      timeMs,
    });

    return {
      ...(duration !== undefined && { duration }),
      ...(fileSize !== undefined && { fileSize }),
      videoStreams,
      audioStreams,
      subtitleStreams,
    };
  } catch (error: any) {
    logger.error('FFprobe failed to extract media info', {
      filePath,
      error: error.message,
    });
    throw new Error(`FFprobe failed: ${error.message}`);
  }
}

/**
 * Extract video stream information
 */
function extractVideoStream(stream: any): VideoStream {
  const videoStream: VideoStream = {
    streamIndex: stream.index,
  };

  // Codec info
  if (stream.codec_name) videoStream.codecName = stream.codec_name;
  if (stream.codec_long_name) videoStream.codecLongName = stream.codec_long_name;
  if (stream.profile) videoStream.profile = stream.profile;

  // Resolution
  if (stream.width) videoStream.width = stream.width;
  if (stream.height) videoStream.height = stream.height;

  // Aspect ratio
  if (stream.display_aspect_ratio) {
    videoStream.aspectRatio = stream.display_aspect_ratio;
  } else if (stream.width && stream.height) {
    videoStream.aspectRatio = `${stream.width}:${stream.height}`;
  }

  // Frame rate
  if (stream.r_frame_rate) {
    const [num, den] = stream.r_frame_rate.split('/').map(Number);
    if (den && den !== 0) {
      videoStream.fps = parseFloat((num / den).toFixed(3));
    }
  }

  // Bit rate
  if (stream.bit_rate) {
    videoStream.bitRate = parseInt(stream.bit_rate, 10);
  }

  // Color information (important for HDR detection)
  if (stream.pix_fmt) videoStream.pixFmt = stream.pix_fmt;
  if (stream.color_range) videoStream.colorRange = stream.color_range;
  if (stream.color_space) videoStream.colorSpace = stream.color_space;
  if (stream.color_transfer) videoStream.colorTransfer = stream.color_transfer;
  if (stream.color_primaries) videoStream.colorPrimaries = stream.color_primaries;

  // Language and metadata
  if (stream.tags?.language) videoStream.language = stream.tags.language;
  if (stream.tags?.title) videoStream.title = stream.tags.title;

  // Disposition flags
  if (stream.disposition) {
    videoStream.isDefault = stream.disposition.default === 1;
    videoStream.isForced = stream.disposition.forced === 1;
  }

  return videoStream;
}

/**
 * Extract audio stream information
 */
function extractAudioStream(stream: any): AudioStream {
  const audioStream: AudioStream = {
    streamIndex: stream.index,
  };

  // Codec info
  if (stream.codec_name) audioStream.codecName = stream.codec_name;
  if (stream.codec_long_name) audioStream.codecLongName = stream.codec_long_name;
  if (stream.profile) audioStream.profile = stream.profile;

  // Audio properties
  if (stream.channels) audioStream.channels = stream.channels;
  if (stream.channel_layout) audioStream.channelLayout = stream.channel_layout;
  if (stream.sample_rate) audioStream.sampleRate = parseInt(stream.sample_rate, 10);

  // Bit rate
  if (stream.bit_rate) {
    audioStream.bitRate = parseInt(stream.bit_rate, 10);
  }

  // Language and metadata
  if (stream.tags?.language) audioStream.language = stream.tags.language;
  if (stream.tags?.title) audioStream.title = stream.tags.title;

  // Disposition flags
  if (stream.disposition) {
    audioStream.isDefault = stream.disposition.default === 1;
    audioStream.isForced = stream.disposition.forced === 1;
  }

  return audioStream;
}

/**
 * Extract embedded subtitle stream information
 */
function extractSubtitleStream(stream: any): SubtitleStream {
  const subtitleStream: SubtitleStream = {
    streamIndex: stream.index,
    sourceType: 'embedded',
  };

  // Codec info
  if (stream.codec_name) subtitleStream.codecName = stream.codec_name;

  // Language and metadata
  if (stream.tags?.language) subtitleStream.language = stream.tags.language;
  if (stream.tags?.title) subtitleStream.title = stream.tags.title;

  // Disposition flags
  if (stream.disposition) {
    subtitleStream.isDefault = stream.disposition.default === 1;
    subtitleStream.isForced = stream.disposition.forced === 1;
    subtitleStream.isSdh = stream.disposition.hearing_impaired === 1;
  }

  // Detect SDH from title if not in disposition
  if (!subtitleStream.isSdh && subtitleStream.title) {
    const titleLower = subtitleStream.title.toLowerCase();
    subtitleStream.isSdh = titleLower.includes('sdh') || titleLower.includes('cc');
  }

  return subtitleStream;
}

/**
 * Store video streams in database
 */
export async function storeVideoStreams(
  db: DatabaseConnection,
  entityType: 'movie' | 'episode',
  entityId: number,
  streams: VideoStream[]
): Promise<void> {
  try {
    // Delete existing streams
    await db.execute(`DELETE FROM video_streams WHERE entity_type = ? AND entity_id = ?`, [
      entityType,
      entityId,
    ]);

    // Insert new streams
    for (const stream of streams) {
      await db.execute(
        `INSERT INTO video_streams (
          entity_type, entity_id, stream_index, codec_name, codec_long_name, profile,
          width, height, aspect_ratio, fps, bit_rate, pix_fmt,
          color_range, color_space, color_transfer, color_primaries,
          language, title, is_default, is_forced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityType,
          entityId,
          stream.streamIndex,
          stream.codecName,
          stream.codecLongName,
          stream.profile,
          stream.width,
          stream.height,
          stream.aspectRatio,
          stream.fps,
          stream.bitRate,
          stream.pixFmt,
          stream.colorRange,
          stream.colorSpace,
          stream.colorTransfer,
          stream.colorPrimaries,
          stream.language,
          stream.title,
          stream.isDefault ? 1 : 0,
          stream.isForced ? 1 : 0,
        ]
      );
    }

    logger.debug('Stored video streams in database', {
      entityType,
      entityId,
      count: streams.length,
    });
  } catch (error: any) {
    logger.error('Failed to store video streams', {
      entityType,
      entityId,
      error: error.message,
    });
    throw new Error(`Failed to store video streams: ${error.message}`);
  }
}

/**
 * Store audio streams in database
 */
export async function storeAudioStreams(
  db: DatabaseConnection,
  entityType: 'movie' | 'episode',
  entityId: number,
  streams: AudioStream[]
): Promise<void> {
  try {
    // Delete existing streams
    await db.execute(`DELETE FROM audio_streams WHERE entity_type = ? AND entity_id = ?`, [
      entityType,
      entityId,
    ]);

    // Insert new streams
    for (const stream of streams) {
      await db.execute(
        `INSERT INTO audio_streams (
          entity_type, entity_id, stream_index, codec_name, codec_long_name, profile,
          channels, channel_layout, sample_rate, bit_rate,
          language, title, is_default, is_forced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityType,
          entityId,
          stream.streamIndex,
          stream.codecName,
          stream.codecLongName,
          stream.profile,
          stream.channels,
          stream.channelLayout,
          stream.sampleRate,
          stream.bitRate,
          stream.language,
          stream.title,
          stream.isDefault ? 1 : 0,
          stream.isForced ? 1 : 0,
        ]
      );
    }

    logger.debug('Stored audio streams in database', {
      entityType,
      entityId,
      count: streams.length,
    });
  } catch (error: any) {
    logger.error('Failed to store audio streams', {
      entityType,
      entityId,
      error: error.message,
    });
    throw new Error(`Failed to store audio streams: ${error.message}`);
  }
}

/**
 * Store subtitle streams in database
 */
export async function storeSubtitleStreams(
  db: DatabaseConnection,
  entityType: 'movie' | 'episode',
  entityId: number,
  streams: SubtitleStream[]
): Promise<void> {
  try {
    // Delete existing embedded streams (external subtitle files handled separately)
    await db.execute(
      `DELETE FROM subtitle_streams WHERE entity_type = ? AND entity_id = ? AND source_type = 'embedded'`,
      [entityType, entityId]
    );

    // Insert new streams
    for (const stream of streams) {
      await db.execute(
        `INSERT INTO subtitle_streams (
          entity_type, entity_id, stream_index, codec_name, source_type, file_path,
          language, title, is_default, is_forced, is_sdh
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityType,
          entityId,
          stream.streamIndex,
          stream.codecName,
          stream.sourceType,
          stream.filePath,
          stream.language,
          stream.title,
          stream.isDefault ? 1 : 0,
          stream.isForced ? 1 : 0,
          stream.isSdh ? 1 : 0,
        ]
      );
    }

    logger.debug('Stored subtitle streams in database', {
      entityType,
      entityId,
      count: streams.length,
    });
  } catch (error: any) {
    logger.error('Failed to store subtitle streams', {
      entityType,
      entityId,
      error: error.message,
    });
    throw new Error(`Failed to store subtitle streams: ${error.message}`);
  }
}

/**
 * Extract and store all stream information for a video file
 */
export async function extractAndStoreMediaInfo(
  db: DatabaseConnection,
  entityType: 'movie' | 'episode',
  entityId: number,
  filePath: string
): Promise<MediaInfo> {
  try {
    const mediaInfo = await extractMediaInfo(filePath);

    // Store streams in database
    await storeVideoStreams(db, entityType, entityId, mediaInfo.videoStreams);
    await storeAudioStreams(db, entityType, entityId, mediaInfo.audioStreams);
    await storeSubtitleStreams(db, entityType, entityId, mediaInfo.subtitleStreams);

    logger.info('Extracted and stored media info', {
      entityType,
      entityId,
      filePath,
      duration: mediaInfo.duration,
      fileSize: mediaInfo.fileSize,
    });

    return mediaInfo;
  } catch (error: any) {
    logger.error('Failed to extract and store media info', {
      entityType,
      entityId,
      filePath,
      error: error.message,
    });
    throw new Error(`Failed to extract and store media info: ${error.message}`);
  }
}
