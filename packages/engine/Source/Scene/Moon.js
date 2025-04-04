import buildModuleUrl from "../Core/buildModuleUrl.js";
import Cartesian3 from "../Core/Cartesian3.js";
import Frozen from "../Core/Frozen.js";
import defined from "../Core/defined.js";
import destroyObject from "../Core/destroyObject.js";
import Ellipsoid from "../Core/Ellipsoid.js";
import IauOrientationAxes from "../Core/IauOrientationAxes.js";
import Matrix3 from "../Core/Matrix3.js";
import Matrix4 from "../Core/Matrix4.js";
import Simon1994PlanetaryPositions from "../Core/Simon1994PlanetaryPositions.js";
import Transforms from "../Core/Transforms.js";
import EllipsoidPrimitive from "./EllipsoidPrimitive.js";
import Material from "./Material.js";

/**
 * Draws the Moon in 3D.
 * @alias Moon
 * @constructor
 *
 * @param {object} [options] Object with the following properties:
 * @param {boolean} [options.show=true] Determines whether the moon will be rendered.
 * @param {string} [options.textureUrl=buildModuleUrl('Assets/Textures/moonSmall.jpg')] The moon texture.
 * @param {Ellipsoid} [options.ellipsoid=Ellipsoid.MOON] The moon ellipsoid.
 * @param {boolean} [options.onlySunLighting=true] Use the sun as the only light source.
 *
 *
 * @example
 * scene.moon = new Cesium.Moon();
 *
 * @see Scene#moon
 */
function Moon(options) {
  options = options ?? Frozen.EMPTY_OBJECT;

  let url = options.textureUrl;
  if (!defined(url)) {
    url = buildModuleUrl("Assets/Textures/moonSmall.jpg");
  }

  /**
   * Determines if the moon will be shown.
   *
   * @type {boolean}
   * @default true
   */
  this.show = options.show ?? true;

  /**
   * The moon texture.
   * @type {string}
   * @default buildModuleUrl('Assets/Textures/moonSmall.jpg')
   */
  this.textureUrl = url;

  this._ellipsoid = options.ellipsoid ?? Ellipsoid.MOON;

  /**
   * Use the sun as the only light source.
   * @type {boolean}
   * @default true
   */
  this.onlySunLighting = options.onlySunLighting ?? true;

  this._ellipsoidPrimitive = new EllipsoidPrimitive({
    radii: this.ellipsoid.radii,
    material: Material.fromType(Material.ImageType),
    depthTestEnabled: false,
    _owner: this,
  });
  this._ellipsoidPrimitive.material.translucent = false;

  this._axes = new IauOrientationAxes();
}

Object.defineProperties(Moon.prototype, {
  /**
   * Get the ellipsoid that defines the shape of the moon.
   *
   * @memberof Moon.prototype
   *
   * @type {Ellipsoid}
   * @readonly
   *
   * @default {@link Ellipsoid.MOON}
   */
  ellipsoid: {
    get: function () {
      return this._ellipsoid;
    },
  },
});

const icrfToFixed = new Matrix3();
const rotationScratch = new Matrix3();
const translationScratch = new Cartesian3();
const scratchCommandList = [];

/**
 * @private
 */
Moon.prototype.update = function (frameState) {
  if (!this.show) {
    return;
  }

  const ellipsoidPrimitive = this._ellipsoidPrimitive;
  ellipsoidPrimitive.material.uniforms.image = this.textureUrl;
  ellipsoidPrimitive.onlySunLighting = this.onlySunLighting;

  const date = frameState.time;
  if (!defined(Transforms.computeIcrfToFixedMatrix(date, icrfToFixed))) {
    Transforms.computeTemeToPseudoFixedMatrix(date, icrfToFixed);
  }

  const rotation = this._axes.evaluate(date, rotationScratch);
  Matrix3.transpose(rotation, rotation);
  Matrix3.multiply(icrfToFixed, rotation, rotation);

  const translation =
    Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(
      date,
      translationScratch,
    );
  Matrix3.multiplyByVector(icrfToFixed, translation, translation);

  Matrix4.fromRotationTranslation(
    rotation,
    translation,
    ellipsoidPrimitive.modelMatrix,
  );

  const savedCommandList = frameState.commandList;
  frameState.commandList = scratchCommandList;
  scratchCommandList.length = 0;
  ellipsoidPrimitive.update(frameState);
  frameState.commandList = savedCommandList;
  return scratchCommandList.length === 1 ? scratchCommandList[0] : undefined;
};

/**
 * Returns true if this object was destroyed; otherwise, false.
 * <br /><br />
 * If this object was destroyed, it should not be used; calling any function other than
 * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.
 *
 * @returns {boolean} <code>true</code> if this object was destroyed; otherwise, <code>false</code>.
 *
 * @see Moon#destroy
 */
Moon.prototype.isDestroyed = function () {
  return false;
};

/**
 * Destroys the WebGL resources held by this object.  Destroying an object allows for deterministic
 * release of WebGL resources, instead of relying on the garbage collector to destroy this object.
 * <br /><br />
 * Once an object is destroyed, it should not be used; calling any function other than
 * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.  Therefore,
 * assign the return value (<code>undefined</code>) to the object as done in the example.
 *
 * @exception {DeveloperError} This object was destroyed, i.e., destroy() was called.
 *
 *
 * @example
 * moon = moon && moon.destroy();
 *
 * @see Moon#isDestroyed
 */
Moon.prototype.destroy = function () {
  this._ellipsoidPrimitive =
    this._ellipsoidPrimitive && this._ellipsoidPrimitive.destroy();
  return destroyObject(this);
};
export default Moon;
