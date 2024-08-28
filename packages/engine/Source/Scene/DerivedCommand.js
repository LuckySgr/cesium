import defined from "../Core/defined.js";
import DrawCommand from "../Renderer/DrawCommand.js";
import RenderState from "../Renderer/RenderState.js";
import ShaderSource from "../Renderer/ShaderSource.js";
import MetadataType from "./MetadataType.js";
import MetadataPickingPipelineStage from "./Model/MetadataPickingPipelineStage.js";

/**
 * @private
 */
function DerivedCommand() {}

const fragDepthRegex = /\bgl_FragDepth\b/;
const discardRegex = /\bdiscard\b/;

function getDepthOnlyShaderProgram(context, shaderProgram) {
  let shader = context.shaderCache.getDerivedShaderProgram(
    shaderProgram,
    "depthOnly"
  );
  if (!defined(shader)) {
    const attributeLocations = shaderProgram._attributeLocations;
    let fs = shaderProgram.fragmentShaderSource;

    let i;
    let writesDepthOrDiscards = false;
    const sources = fs.sources;
    let length = sources.length;
    for (i = 0; i < length; ++i) {
      if (fragDepthRegex.test(sources[i]) || discardRegex.test(sources[i])) {
        writesDepthOrDiscards = true;
        break;
      }
    }

    let usesLogDepth = false;
    const defines = fs.defines;
    length = defines.length;
    for (i = 0; i < length; ++i) {
      if (defines[i] === "LOG_DEPTH") {
        usesLogDepth = true;
        break;
      }
    }

    let source;
    if (!writesDepthOrDiscards && !usesLogDepth) {
      source =
        "void main() \n" +
        "{ \n" +
        "    out_FragColor = vec4(1.0); \n" +
        "} \n";
      fs = new ShaderSource({
        sources: [source],
      });
    } else if (!writesDepthOrDiscards && usesLogDepth) {
      source =
        "void main() \n" +
        "{ \n" +
        "    out_FragColor = vec4(1.0); \n" +
        "    czm_writeLogDepth(); \n" +
        "} \n";
      fs = new ShaderSource({
        defines: ["LOG_DEPTH"],
        sources: [source],
      });
    }

    shader = context.shaderCache.createDerivedShaderProgram(
      shaderProgram,
      "depthOnly",
      {
        vertexShaderSource: shaderProgram.vertexShaderSource,
        fragmentShaderSource: fs,
        attributeLocations: attributeLocations,
      }
    );
  }

  return shader;
}

function getDepthOnlyRenderState(scene, renderState) {
  const cache = scene._depthOnlyRenderStateCache;
  let depthOnlyState = cache[renderState.id];
  if (!defined(depthOnlyState)) {
    const rs = RenderState.getState(renderState);
    rs.depthMask = true;
    rs.colorMask = {
      red: false,
      green: false,
      blue: false,
      alpha: false,
    };

    depthOnlyState = RenderState.fromCache(rs);
    cache[renderState.id] = depthOnlyState;
  }

  return depthOnlyState;
}

DerivedCommand.createDepthOnlyDerivedCommand = function (
  scene,
  command,
  context,
  result
) {
  // For a depth only pass, we bind a framebuffer with only a depth attachment (no color attachments),
  // do not write color, and write depth. If the fragment shader doesn't modify the fragment depth
  // or discard, the driver can replace the fragment shader with a pass-through shader. We're unsure if this
  // actually happens so we modify the shader to use a pass-through fragment shader.

  if (!defined(result)) {
    result = {};
  }

  let shader;
  let renderState;
  if (defined(result.depthOnlyCommand)) {
    shader = result.depthOnlyCommand.shaderProgram;
    renderState = result.depthOnlyCommand.renderState;
  }

  result.depthOnlyCommand = DrawCommand.shallowClone(
    command,
    result.depthOnlyCommand
  );

  if (!defined(shader) || result.shaderProgramId !== command.shaderProgram.id) {
    result.depthOnlyCommand.shaderProgram = getDepthOnlyShaderProgram(
      context,
      command.shaderProgram
    );
    result.depthOnlyCommand.renderState = getDepthOnlyRenderState(
      scene,
      command.renderState
    );
    result.shaderProgramId = command.shaderProgram.id;
  } else {
    result.depthOnlyCommand.shaderProgram = shader;
    result.depthOnlyCommand.renderState = renderState;
  }

  return result;
};

const writeLogDepthRegex = /\s+czm_writeLogDepth\(/;
const vertexlogDepthRegex = /\s+czm_vertexLogDepth\(/;

function getLogDepthShaderProgram(context, shaderProgram) {
  const disableLogDepthWrite =
    shaderProgram.fragmentShaderSource.defines.indexOf("LOG_DEPTH_READ_ONLY") >=
    0;
  if (disableLogDepthWrite) {
    return shaderProgram;
  }

  let shader = context.shaderCache.getDerivedShaderProgram(
    shaderProgram,
    "logDepth"
  );
  if (!defined(shader)) {
    const attributeLocations = shaderProgram._attributeLocations;
    const vs = shaderProgram.vertexShaderSource.clone();
    const fs = shaderProgram.fragmentShaderSource.clone();

    vs.defines = defined(vs.defines) ? vs.defines.slice(0) : [];
    vs.defines.push("LOG_DEPTH");
    fs.defines = defined(fs.defines) ? fs.defines.slice(0) : [];
    fs.defines.push("LOG_DEPTH");

    let i;
    let logMain;
    let writesLogDepth = false;
    let sources = vs.sources;
    let length = sources.length;
    for (i = 0; i < length; ++i) {
      if (vertexlogDepthRegex.test(sources[i])) {
        writesLogDepth = true;
        break;
      }
    }

    if (!writesLogDepth) {
      for (i = 0; i < length; ++i) {
        sources[i] = ShaderSource.replaceMain(sources[i], "czm_log_depth_main");
      }

      logMain =
        "\n\n" +
        "void main() \n" +
        "{ \n" +
        "    czm_log_depth_main(); \n" +
        "    czm_vertexLogDepth(); \n" +
        "} \n";
      sources.push(logMain);
    }

    sources = fs.sources;
    length = sources.length;

    writesLogDepth = false;
    for (i = 0; i < length; ++i) {
      if (writeLogDepthRegex.test(sources[i])) {
        writesLogDepth = true;
      }
    }
    // This define indicates that a log depth value is written by the shader but doesn't use czm_writeLogDepth.
    if (fs.defines.indexOf("LOG_DEPTH_WRITE") !== -1) {
      writesLogDepth = true;
    }

    let logSource = "";

    if (!writesLogDepth) {
      for (i = 0; i < length; i++) {
        sources[i] = ShaderSource.replaceMain(sources[i], "czm_log_depth_main");
      }

      logSource +=
        "\n" +
        "void main() \n" +
        "{ \n" +
        "    czm_log_depth_main(); \n" +
        "    czm_writeLogDepth(); \n" +
        "} \n";
    }

    sources.push(logSource);

    shader = context.shaderCache.createDerivedShaderProgram(
      shaderProgram,
      "logDepth",
      {
        vertexShaderSource: vs,
        fragmentShaderSource: fs,
        attributeLocations: attributeLocations,
      }
    );
  }

  return shader;
}

DerivedCommand.createLogDepthCommand = function (command, context, result) {
  if (!defined(result)) {
    result = {};
  }

  let shader;
  if (defined(result.command)) {
    shader = result.command.shaderProgram;
  }

  result.command = DrawCommand.shallowClone(command, result.command);

  if (!defined(shader) || result.shaderProgramId !== command.shaderProgram.id) {
    result.command.shaderProgram = getLogDepthShaderProgram(
      context,
      command.shaderProgram
    );
    result.shaderProgramId = command.shaderProgram.id;
  } else {
    result.command.shaderProgram = shader;
  }

  return result;
};

function getPickShaderProgram(context, shaderProgram, pickId, pickingMetadata) {
  const keyword = `pick-pickingMetadata-${pickingMetadata}`;
  let shader = context.shaderCache.getDerivedShaderProgram(
    shaderProgram,
    keyword
  );
  //console.log("getPickShaderProgram with pickId ", pickId);
  //console.log("getPickShaderProgram with pickingMetadata ", pickingMetadata);
  //console.log("getPickShaderProgram with shader ", shader);
  if (!defined(shader)) {
    const attributeLocations = shaderProgram._attributeLocations;
    let fs = shaderProgram.fragmentShaderSource;

    const sources = fs.sources;
    const length = sources.length;

    const hasFragData = sources.some((source) =>
      source.includes("out_FragData")
    );
    const outputColorVariable = hasFragData
      ? "out_FragData_0"
      : "out_FragColor";

    // The output fragment should be discarded only when NOT
    // trying to pick metadata
    let newMain;
    if (pickingMetadata === true) {
      newMain = `void main () 
{ 
    czm_non_pick_main(); 
    ${outputColorVariable} = ${pickId}; 
} `;
    } else {
      newMain = `void main () 
{ 
    czm_non_pick_main(); 
    if (${outputColorVariable}.a == 0.0) { 
        discard; 
    } 
    ${outputColorVariable} = ${pickId}; 
} `;
    }

    const newSources = new Array(length + 1);
    for (let i = 0; i < length; ++i) {
      newSources[i] = ShaderSource.replaceMain(sources[i], "czm_non_pick_main");
    }
    newSources[length] = newMain;
    fs = new ShaderSource({
      sources: newSources,
      defines: fs.defines,
    });
    shader = context.shaderCache.createDerivedShaderProgram(
      shaderProgram,
      keyword,
      {
        vertexShaderSource: shaderProgram.vertexShaderSource,
        fragmentShaderSource: fs,
        attributeLocations: attributeLocations,
      }
    );
  }

  return shader;
}

function getPickRenderState(scene, renderState) {
  const cache = scene.picking.pickRenderStateCache;
  let pickState = cache[renderState.id];
  if (!defined(pickState)) {
    const rs = RenderState.getState(renderState);
    rs.blending.enabled = false;

    // Turns on depth writing for opaque and translucent passes
    // Overlapping translucent geometry on the globe surface may exhibit z-fighting
    // during the pick pass which may not match the rendered scene. Once
    // terrain is on by default and ground primitives are used instead
    // this will become less of a problem.
    rs.depthMask = true;

    pickState = RenderState.fromCache(rs);
    cache[renderState.id] = pickState;
  }

  return pickState;
}

DerivedCommand.createPickDerivedCommand = function (
  scene,
  command,
  context,
  result
) {
  if (!defined(result)) {
    result = {};
  }

  let shader;
  let renderState;
  if (defined(result.pickCommand)) {
    shader = result.pickCommand.shaderProgram;
    renderState = result.pickCommand.renderState;
  }

  result.pickCommand = DrawCommand.shallowClone(command, result.pickCommand);

  const frameState = scene._frameState;
  const pickingMetadata = frameState.pickingMetadata;
  if (
    !defined(shader) ||
    pickingMetadata ||
    result.shaderProgramId !== command.shaderProgram.id
  ) {
    result.pickCommand.shaderProgram = getPickShaderProgram(
      context,
      command.shaderProgram,
      command.pickId,
      pickingMetadata
    );
    result.pickCommand.renderState = getPickRenderState(
      scene,
      command.renderState
    );
    result.shaderProgramId = command.shaderProgram.id;
  } else {
    result.pickCommand.shaderProgram = shader;
    result.pickCommand.renderState = renderState;
  }

  return result;
};

/**
 * Replaces the value of the specified 'define' directive identifier
 * with the given value.
 *
 * The given defines are the parts of the define directives that are
 * stored in the `ShaderSource`. For example, the defines may be
 * `["EXAMPLE", "EXAMPLE_VALUE 123"]`
 *
 * Calling `replaceDefine(defines, "EXAMPLE", 999)` will result in
 * the defines being
 * `["EXAMPLE 999", "EXAMPLE_VALUE 123"]`
 *
 * @param {string[]} defines The define directive identifiers
 * @param {string} defineName The name (identifier) of the define directive
 * @param {any} newDefineValue The new value whose string representation
 * will become the token string for the define directive
 * @private
 */
function replaceDefine(defines, defineName, newDefineValue) {
  const n = defines.length;
  for (let i = 0; i < n; i++) {
    const define = defines[i];
    const tokens = define.trimStart().split(/\s+/);
    if (tokens[0] === defineName) {
      defines[i] = `${defineName} ${newDefineValue}`;
    }
  }
}

/**
 * Returns the component count for the given class property, or
 * its array length if it is an array.
 *
 * This will be
 * `[1, 2, 3, 4]` for `[SCALAR, VEC2, VEC3, VEC4`] types,
 * or the array length if it is an array.
 *
 * @param {MetadataClassProperty} classProperty The class property
 * @returns The component count
 * @private
 */
function getComponentCount(classProperty) {
  if (!classProperty.isArray) {
    return MetadataType.getComponentCount(classProperty.type);
  }
  return classProperty.arrayLength;
}

/**
 * Returns the type that the given class property has in a GLSL shader.
 *
 * It returns the same string as `PropertyTextureProperty.prototype.getGlslType`
 * for a property texture property with the given class property
 *
 * @param {MetadataClassProperty} classProperty The class property
 * @returns The GLSL shader type string for the property
 */
function getGlslType(classProperty) {
  const componentCount = getComponentCount(classProperty);
  if (classProperty.normalized) {
    if (componentCount === 1) {
      return "float";
    }
    return `vec${componentCount}`;
  }
  if (componentCount === 1) {
    return "int";
  }
  return `ivec${componentCount}`;
}

/**
 * Creates a new `ShaderProgram` from the given input that renders metadata
 * values into the frame buffer, according to the given picked metadata info.
 *
 * This will update the `defines` of the fragment shader of the given shader
 * program, by setting `METADATA_PICKING_ENABLED`, and updating the
 * `METADATA_PICKING_VALUE_*` defines so that they reflect the components
 * of the metadata that should be written into the RGBA (vec4) that
 * ends up as the 'color' in the frame buffer.
 *
 * The RGBA values will eventually be converted back into an actual metadata
 * value in `Picking.js`, by calling `MetadataPicking.decodeMetadataValues`.
 *
 * @param {Context} context The context
 * @param {ShaderProgram} shaderProgram The shader program
 * @param {PickedMetadataInfo} pickedMetadataInfo The picked metadata info
 * @returns The new shader program
 * @private
 */
function getPickMetadataShaderProgram(
  context,
  shaderProgram,
  pickedMetadataInfo
) {
  const schemaId = pickedMetadataInfo.schemaId;
  const className = pickedMetadataInfo.className;
  const propertyName = pickedMetadataInfo.propertyName;
  const keyword = `pickMetadata-${schemaId}-${className}-${propertyName}`;
  const shader = context.shaderCache.getDerivedShaderProgram(
    shaderProgram,
    keyword
  );
  if (defined(shader)) {
    return shader;
  }

  const classProperty = pickedMetadataInfo.classProperty;
  const glslType = getGlslType(classProperty);

  // Define the components that will go into the output `metadataValues`.
  // By default, all of them are 0.0.
  const sourceValueStrings = ["0.0", "0.0", "0.0", "0.0"];
  const componentCount = getComponentCount(classProperty);
  if (componentCount === 1) {
    // When the property is a scalar, store its value directly
    // in `metadataValues.x`
    sourceValueStrings[0] = `float(value)`;
  } else {
    // When the property is an array, store the array elements
    // in `metadataValues.x/y/z/w`
    const components = ["x", "y", "z", "w"];
    for (let i = 0; i < componentCount; i++) {
      const component = components[i];
      const valueString = `value.${component}`;
      sourceValueStrings[i] = `float(${valueString})`;
    }
  }

  // Make sure that the `metadataValues` components are all in
  // the range [0, 1] (which will result in RGBA components
  // in [0, 255] during rendering)
  if (!classProperty.normalized) {
    for (let i = 0; i < componentCount; i++) {
      sourceValueStrings[i] += " / 255.0";
    }
  }

  const newDefines = shaderProgram.fragmentShaderSource.defines.slice();
  newDefines.push(MetadataPickingPipelineStage.METADATA_PICKING_ENABLED);

  // Replace the defines of the shader, using the type, property
  // access, and value components  that have been determined
  replaceDefine(
    newDefines,
    MetadataPickingPipelineStage.METADATA_PICKING_VALUE_TYPE,
    glslType
  );
  replaceDefine(
    newDefines,
    MetadataPickingPipelineStage.METADATA_PICKING_VALUE_STRING,
    `metadata.${propertyName}`
  );
  replaceDefine(
    newDefines,
    MetadataPickingPipelineStage.METADATA_PICKING_VALUE_COMPONENT_X,
    sourceValueStrings[0]
  );
  replaceDefine(
    newDefines,
    MetadataPickingPipelineStage.METADATA_PICKING_VALUE_COMPONENT_Y,
    sourceValueStrings[1]
  );
  replaceDefine(
    newDefines,
    MetadataPickingPipelineStage.METADATA_PICKING_VALUE_COMPONENT_Z,
    sourceValueStrings[2]
  );
  replaceDefine(
    newDefines,
    MetadataPickingPipelineStage.METADATA_PICKING_VALUE_COMPONENT_W,
    sourceValueStrings[3]
  );

  const newFragmentShaderSource = new ShaderSource({
    sources: shaderProgram.fragmentShaderSource.sources,
    defines: newDefines,
  });
  const newShader = context.shaderCache.createDerivedShaderProgram(
    shaderProgram,
    keyword,
    {
      vertexShaderSource: shaderProgram.vertexShaderSource,
      fragmentShaderSource: newFragmentShaderSource,
      attributeLocations: shaderProgram._attributeLocations,
    }
  );
  return newShader;
}

/**
 * @private
 */
DerivedCommand.createPickMetadataDerivedCommand = function (
  scene,
  command,
  context,
  result
) {
  if (!defined(result)) {
    result = {};
  }
  result.pickMetadataCommand = DrawCommand.shallowClone(
    command,
    result.pickMetadataCommand
  );

  result.pickMetadataCommand.shaderProgram = getPickMetadataShaderProgram(
    context,
    command.shaderProgram,
    command.pickedMetadataInfo
  );
  result.pickMetadataCommand.renderState = getPickRenderState(
    scene,
    command.renderState
  );
  result.shaderProgramId = command.shaderProgram.id;

  return result;
};

function getHdrShaderProgram(context, shaderProgram) {
  let shader = context.shaderCache.getDerivedShaderProgram(
    shaderProgram,
    "HDR"
  );
  if (!defined(shader)) {
    const attributeLocations = shaderProgram._attributeLocations;
    const vs = shaderProgram.vertexShaderSource.clone();
    const fs = shaderProgram.fragmentShaderSource.clone();

    vs.defines = defined(vs.defines) ? vs.defines.slice(0) : [];
    vs.defines.push("HDR");
    fs.defines = defined(fs.defines) ? fs.defines.slice(0) : [];
    fs.defines.push("HDR");

    shader = context.shaderCache.createDerivedShaderProgram(
      shaderProgram,
      "HDR",
      {
        vertexShaderSource: vs,
        fragmentShaderSource: fs,
        attributeLocations: attributeLocations,
      }
    );
  }

  return shader;
}

DerivedCommand.createHdrCommand = function (command, context, result) {
  if (!defined(result)) {
    result = {};
  }

  let shader;
  if (defined(result.command)) {
    shader = result.command.shaderProgram;
  }

  result.command = DrawCommand.shallowClone(command, result.command);

  if (!defined(shader) || result.shaderProgramId !== command.shaderProgram.id) {
    result.command.shaderProgram = getHdrShaderProgram(
      context,
      command.shaderProgram
    );
    result.shaderProgramId = command.shaderProgram.id;
  } else {
    result.command.shaderProgram = shader;
  }

  return result;
};
export default DerivedCommand;
