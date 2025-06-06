import Frozen from "./Frozen.js";
import defined from "./defined.js";
import Ellipsoid from "./Ellipsoid.js";
import Event from "./Event.js";
import GeographicTilingScheme from "./GeographicTilingScheme.js";
import HeightmapTerrainData from "./HeightmapTerrainData.js";
import TerrainProvider from "./TerrainProvider.js";

/**
 * A very simple {@link TerrainProvider} that produces geometry by tessellating an ellipsoidal
 * surface.
 *
 * @alias EllipsoidTerrainProvider
 * @constructor
 *
 * @param {object} [options] Object with the following properties:
 * @param {TilingScheme} [options.tilingScheme] The tiling scheme specifying how the ellipsoidal
 * surface is broken into tiles.  If this parameter is not provided, a {@link GeographicTilingScheme}
 * is used.
 * @param {Ellipsoid} [options.ellipsoid=Ellipsoid.default] The ellipsoid.  If the tilingScheme is specified,
 * this parameter is ignored and the tiling scheme's ellipsoid is used instead. If neither
 * parameter is specified, the default ellipsoid is used.
 *
 * @see TerrainProvider
 */
function EllipsoidTerrainProvider(options) {
  options = options ?? Frozen.EMPTY_OBJECT;

  this._tilingScheme = options.tilingScheme;
  if (!defined(this._tilingScheme)) {
    this._tilingScheme = new GeographicTilingScheme({
      ellipsoid: options.ellipsoid ?? Ellipsoid.default,
    });
  }

  // Note: the 64 below does NOT need to match the actual vertex dimensions, because
  // the ellipsoid is significantly smoother than actual terrain.
  this._levelZeroMaximumGeometricError =
    TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(
      this._tilingScheme.ellipsoid,
      64,
      this._tilingScheme.getNumberOfXTilesAtLevel(0),
    );

  this._errorEvent = new Event();
}

Object.defineProperties(EllipsoidTerrainProvider.prototype, {
  /**
   * Gets an event that is raised when the terrain provider encounters an asynchronous error.  By subscribing
   * to the event, you will be notified of the error and can potentially recover from it.  Event listeners
   * are passed an instance of {@link TileProviderError}.
   * @memberof EllipsoidTerrainProvider.prototype
   * @type {Event}
   * @readonly
   */
  errorEvent: {
    get: function () {
      return this._errorEvent;
    },
  },

  /**
   * Gets the credit to display when this terrain provider is active.  Typically this is used to credit
   * the source of the terrain.
   * @memberof EllipsoidTerrainProvider.prototype
   * @type {Credit}
   * @readonly
   */
  credit: {
    get: function () {
      return undefined;
    },
  },

  /**
   * Gets the tiling scheme used by this provider.
   * @memberof EllipsoidTerrainProvider.prototype
   * @type {GeographicTilingScheme}
   * @readonly
   */
  tilingScheme: {
    get: function () {
      return this._tilingScheme;
    },
  },

  /**
   * Gets a value indicating whether or not the provider includes a water mask.  The water mask
   * indicates which areas of the globe are water rather than land, so they can be rendered
   * as a reflective surface with animated waves.
   * @memberof EllipsoidTerrainProvider.prototype
   * @type {boolean}
   * @readonly
   */
  hasWaterMask: {
    get: function () {
      return false;
    },
  },

  /**
   * Gets a value indicating whether or not the requested tiles include vertex normals.
   * @memberof EllipsoidTerrainProvider.prototype
   * @type {boolean}
   * @readonly
   */
  hasVertexNormals: {
    get: function () {
      return false;
    },
  },
  /**
   * Gets an object that can be used to determine availability of terrain from this provider, such as
   * at points and in rectangles. This property may be undefined if availability
   * information is not available.
   * @memberof EllipsoidTerrainProvider.prototype
   * @type {TileAvailability|undefined}
   * @readonly
   */
  availability: {
    get: function () {
      return undefined;
    },
  },
});

/**
 * Requests the geometry for a given tile. The result includes terrain
 * data and indicates that all child tiles are available.
 *
 * @param {number} x The X coordinate of the tile for which to request geometry.
 * @param {number} y The Y coordinate of the tile for which to request geometry.
 * @param {number} level The level of the tile for which to request geometry.
 * @param {Request} [request] The request object. Intended for internal use only.
 *
 * @returns {Promise<TerrainData>|undefined} A promise for the requested geometry.  If this method
 *          returns undefined instead of a promise, it is an indication that too many requests are already
 *          pending and the request will be retried later.
 */
EllipsoidTerrainProvider.prototype.requestTileGeometry = function (
  x,
  y,
  level,
  request,
) {
  const width = 16;
  const height = 16;
  return Promise.resolve(
    new HeightmapTerrainData({
      buffer: new Uint8Array(width * height),
      width: width,
      height: height,
    }),
  );
};

/**
 * Gets the maximum geometric error allowed in a tile at a given level.
 *
 * @param {number} level The tile level for which to get the maximum geometric error.
 * @returns {number} The maximum geometric error.
 */
EllipsoidTerrainProvider.prototype.getLevelMaximumGeometricError = function (
  level,
) {
  return this._levelZeroMaximumGeometricError / (1 << level);
};

/**
 * Determines whether data for a tile is available to be loaded.
 *
 * @param {number} x The X coordinate of the tile for which to request geometry.
 * @param {number} y The Y coordinate of the tile for which to request geometry.
 * @param {number} level The level of the tile for which to request geometry.
 * @returns {boolean|undefined} Undefined if not supported, otherwise true or false.
 */
EllipsoidTerrainProvider.prototype.getTileDataAvailable = function (
  x,
  y,
  level,
) {
  return undefined;
};

/**
 * Makes sure we load availability data for a tile
 *
 * @param {number} x The X coordinate of the tile for which to request geometry.
 * @param {number} y The Y coordinate of the tile for which to request geometry.
 * @param {number} level The level of the tile for which to request geometry.
 * @returns {undefined} This provider does not support loading availability.
 */
EllipsoidTerrainProvider.prototype.loadTileDataAvailability = function (
  x,
  y,
  level,
) {
  return undefined;
};
export default EllipsoidTerrainProvider;
