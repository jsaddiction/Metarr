import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../middleware/logging.js';
import { DatabaseConnection } from '../../types/database.js';
import { getErrorMessage } from '../../utils/errorHandling.js';
import { ProcessError, DatabaseError, ErrorCode } from '../../errors/index.js';

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
 * FFprobe stream object types (raw output from ffprobe)
 */
interface FFprobeStream {
  index: number;
  codec_type: string;
  codec_name?: string;
  codec_long_name?: string;
  profile?: string;
  width?: number;
  height?: number;
  display_aspect_ratio?: string;
  r_frame_rate?: string;
  bit_rate?: string;
  pix_fmt?: string;
  color_range?: string;
  color_space?: string;
  color_transfer?: string;
  color_primaries?: string;
  channels?: number;
  channel_layout?: string;
  sample_rate?: string;
  tags?: {
    language?: string;
    title?: string;
  };
  disposition?: {
    default?: number;
    forced?: number;
    hearing_impaired?: number;
  };
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
  } catch (error) {
    logger.error('FFprobe failed to extract media info', {
      filePath,
      error: getErrorMessage(error),
    });

    // Check if this is a process execution error
    if (error instanceof Error && 'code' in error) {
      throw new ProcessError(
        'ffprobe',
        (error as any).code || -1,
        `FFprobe failed: ${getErrorMessage(error)}`,
        { metadata: { filePath } },
        error
      );
    }

    throw new ProcessError(
      'ffprobe',
      -1,
      `FFprobe failed: ${getErrorMessage(error)}`,
      { metadata: { filePath } },
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Extract video stream information
 */
function extractVideoStream(stream: FFprobeStream): VideoStream {
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
function extractAudioStream(stream: FFprobeStream): AudioStream {
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
function extractSubtitleStream(stream: FFprobeStream): SubtitleStream {
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

    // Insert new streams (clean schema: simplified columns)
    for (const stream of streams) {
      // Detect HDR type from color info
      let hdrType: string | null = null;
      if (stream.colorTransfer) {
        const transfer = stream.colorTransfer.toLowerCase();
        if (transfer.includes('smpte2084') || transfer.includes('pq')) {
          hdrType = 'HDR10';
        } else if (transfer.includes('arib-std-b67') || transfer.includes('hlg')) {
          hdrType = 'HLG';
        } else if (transfer.includes('bt2020')) {
          hdrType = 'HDR';
        }
      }

      await db.execute(
        `INSERT INTO video_streams (
          entity_type, entity_id, stream_index, codec,
          width, height, aspect_ratio, framerate, bitrate, hdr_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityType,
          entityId,
          stream.streamIndex,
          stream.codecName, // Maps to 'codec' column
          stream.width,
          stream.height,
          stream.aspectRatio,
          stream.fps, // Maps to 'framerate' column
          stream.bitRate, // Maps to 'bitrate' column
          hdrType,
        ]
      );
    }

    logger.debug('Stored video streams in database', {
      entityType,
      entityId,
      count: streams.length,
    });
  } catch (error) {
    logger.error('Failed to store video streams', {
      entityType,
      entityId,
      error: getErrorMessage(error),
    });
    // Re-throw ApplicationError instances as-is
    if (error instanceof DatabaseError) {
      throw error;
    }
    // Wrap other errors
    throw new DatabaseError(
      `Failed to store video streams: ${getErrorMessage(error)}`,
      ErrorCode.DATABASE_QUERY_FAILED,
      true,
      { metadata: { entityType, entityId } },
      error instanceof Error ? error : undefined
    );
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

    // Insert new streams (clean schema: simplified columns)
    for (const stream of streams) {
      await db.execute(
        `INSERT INTO audio_streams (
          entity_type, entity_id, stream_index, codec,
          language, channels, bitrate, title, default_stream
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityType,
          entityId,
          stream.streamIndex,
          stream.codecName, // Maps to 'codec' column
          stream.language,
          stream.channels,
          stream.bitRate, // Maps to 'bitrate' column
          stream.title,
          stream.isDefault ? 1 : 0, // Maps to 'default_stream' column
        ]
      );
    }

    logger.debug('Stored audio streams in database', {
      entityType,
      entityId,
      count: streams.length,
    });
  } catch (error) {
    logger.error('Failed to store audio streams', {
      entityType,
      entityId,
      error: getErrorMessage(error),
    });
    // Re-throw ApplicationError instances as-is
    if (error instanceof DatabaseError) {
      throw error;
    }
    // Wrap other errors
    throw new DatabaseError(
      `Failed to store audio streams: ${getErrorMessage(error)}`,
      ErrorCode.DATABASE_QUERY_FAILED,
      true,
      { metadata: { entityType, entityId } },
      error instanceof Error ? error : undefined
    );
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
    // Delete existing streams (clean schema doesn't distinguish embedded vs external)
    await db.execute(
      `DELETE FROM subtitle_streams WHERE entity_type = ? AND entity_id = ? AND stream_index IS NOT NULL`,
      [entityType, entityId]
    );

    // Insert new streams (clean schema: simplified columns)
    for (const stream of streams) {
      await db.execute(
        `INSERT INTO subtitle_streams (
          entity_type, entity_id, stream_index, language, title,
          format, forced, default_stream
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityType,
          entityId,
          stream.streamIndex,
          stream.language || 'und', // language is NOT NULL in clean schema
          stream.title,
          stream.codecName, // Maps to 'format' column
          stream.isForced ? 1 : 0, // Maps to 'forced' column
          stream.isDefault ? 1 : 0, // Maps to 'default_stream' column
        ]
      );
    }

    logger.debug('Stored subtitle streams in database', {
      entityType,
      entityId,
      count: streams.length,
    });
  } catch (error) {
    logger.error('Failed to store subtitle streams', {
      entityType,
      entityId,
      error: getErrorMessage(error),
    });
    // Re-throw ApplicationError instances as-is
    if (error instanceof DatabaseError) {
      throw error;
    }
    // Wrap other errors
    throw new DatabaseError(
      `Failed to store subtitle streams: ${getErrorMessage(error)}`,
      ErrorCode.DATABASE_QUERY_FAILED,
      true,
      { metadata: { entityType, entityId } },
      error instanceof Error ? error : undefined
    );
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
    // NOTE: Main movie/episode file is NOT stored in cache_video_files
    // That table is only for trailers, samples, and extras
    // The main file path is already stored in movies.file_path or episodes.file_path
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
  } catch (error) {
    logger.error('Failed to extract and store media info', {
      entityType,
      entityId,
      filePath,
      error: getErrorMessage(error),
    });
    // Re-throw ApplicationError instances as-is
    if (error instanceof ProcessError || error instanceof DatabaseError) {
      throw error;
    }
    // Wrap other errors
    throw new ProcessError(
      'ffprobe',
      -1,
      `Failed to extract and store media info: ${getErrorMessage(error)}`,
      { metadata: { entityType, entityId, filePath } },
      error instanceof Error ? error : undefined
    );
  }
}
