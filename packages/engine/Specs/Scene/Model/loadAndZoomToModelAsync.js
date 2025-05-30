import { Model } from "../../../index.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

async function loadAndZoomToModelAsync(options, scene) {
  options = {
    environmentMapOptions: {
      enabled: false, // disable other diffuse lighting by default
      ...options.environmentMapOptions,
    },
    ...options,
  };

  const model = await Model.fromGltfAsync(options);
  scene.primitives.add(model);

  await pollToPromise(
    function () {
      scene.renderForSpecs();
      return model.ready;
    },
    { timeout: 10000 },
  );

  scene.camera.flyToBoundingSphere(model.boundingSphere, {
    duration: 0,
    offset: options.offset,
  });

  return model;
}

export default loadAndZoomToModelAsync;
