import { Request, Response, NextFunction } from 'express';
import { ImageService } from '../services/imageService.js';
import multer from 'multer';

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG and PNG images are allowed.'));
    }
  },
});

export class ImageController {
  public upload = upload;

  constructor(private imageService: ImageService) {}

  /**
   * GET /api/movies/:id/images
   * Get all images for a movie
   */
  async getMovieImages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const imageType = req.query.type as string | undefined;

      if (isNaN(movieId)) {
        res.status(400).json({ error: 'Invalid movie ID' });
        return;
      }

      const images = await this.imageService.getImages('movie', movieId, imageType);

      res.json({
        success: true,
        images: images.map(img => ({
          ...img,
          // Add URL for frontend to access cached image
          cache_url: `/api/images/${img.id}/file`,
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/movies/:id/images/upload
   * Upload custom image for a movie
   */
  async uploadMovieImage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const imageType = req.body.imageType as string;

      if (isNaN(movieId)) {
        res.status(400).json({ error: 'Invalid movie ID' });
        return;
      }

      if (!imageType) {
        res.status(400).json({ error: 'Image type is required' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const cacheFileId = await this.imageService.uploadCustomImage(
        'movie',
        movieId,
        imageType,
        req.file.buffer,
        req.file.originalname
      );

      res.json({
        success: true,
        message: 'Image uploaded successfully',
        image: {
          id: cacheFileId,
          cache_url: `/api/images/${cacheFileId}/file`,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/images/:id/lock
   * Lock/unlock an image
   */
  async lockImage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const imageId = parseInt(req.params.id);
      const { locked } = req.body;

      if (isNaN(imageId)) {
        res.status(400).json({ error: 'Invalid image ID' });
        return;
      }

      if (typeof locked !== 'boolean') {
        res.status(400).json({ error: 'Locked must be a boolean' });
        return;
      }

      await this.imageService.setImageLock(imageId, locked);

      res.json({
        success: true,
        message: `Image ${locked ? 'locked' : 'unlocked'} successfully`,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/images/:id
   * Delete an image
   */
  async deleteImage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const imageId = parseInt(req.params.id);

      if (isNaN(imageId)) {
        res.status(400).json({ error: 'Invalid image ID' });
        return;
      }

      await this.imageService.deleteImage(imageId);

      res.json({
        success: true,
        message: 'Image deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/images/:id/file
   * Serve image file from cache
   */
  async serveImage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const imageId = parseInt(req.params.id);

      if (isNaN(imageId)) {
        res.status(404).send('Image not found');
        return;
      }

      const result = await this.imageService.getImageStream(imageId);

      if (!result) {
        res.status(404).send('Image not found');
        return;
      }

      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
      result.stream.pipe(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/movies/:id/images/recover
   * Recover missing images from cache
   */
  async recoverImages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);

      if (isNaN(movieId)) {
        res.status(400).json({ error: 'Invalid movie ID' });
        return;
      }

      const recoveredCount = await this.imageService.recoverMissingImages('movie', movieId);

      res.json({
        success: true,
        message: `Recovered ${recoveredCount} image(s) from cache`,
        recoveredCount,
      });
    } catch (error) {
      next(error);
    }
  }
}
