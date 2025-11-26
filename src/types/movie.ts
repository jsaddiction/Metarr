/**
 * Movie-specific type definitions
 *
 * Types for movie cast management and related operations.
 */

/**
 * Movie actor link with role and ordering information
 * Represents the relationship between a movie and an actor
 */
export interface MovieActorLink {
  id: number;
  movie_id: number;
  actor_id: number;
  actor_name: string;
  role: string | null;
  actor_order: number | null;
  role_locked: boolean;
  removed: boolean;
}

/**
 * Request payload for updating movie cast
 * Sent from frontend to backend when modifying actors
 */
export interface CastUpdateRequest {
  actors: Array<{
    actor_id: number;
    role: string | null;
    actor_order: number;
    role_locked: boolean;
    removed: boolean;
  }>;
  actors_order_locked: boolean;
}

/**
 * Response payload after updating movie cast
 * Sent from backend to frontend with updated actor data
 */
export interface CastUpdateResponse {
  success: boolean;
  message: string;
  actors: MovieActorLink[];
  actors_order_locked: boolean;
}
