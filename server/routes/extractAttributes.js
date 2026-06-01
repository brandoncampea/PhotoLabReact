// Pure CommonJS utility for extracting attributes from an order item
function extractAttributesFromOrderItem(item) {
  let attrs = null;
  let options = item.productOptions;
  if (typeof options === 'string') {
    try { options = JSON.parse(options); } catch { options = {}; }
  }
  if (options && typeof options === 'object') {
    if (Array.isArray(options.attributes) && options.attributes.length > 0) {
      attrs = options.attributes;
    } else if (typeof options.attributes === 'string') {
      attrs = [options.attributes];
    } else if (Array.isArray(options.whccItemAttributeUIDs) && options.whccItemAttributeUIDs.length > 0) {
      attrs = options.whccItemAttributeUIDs;
    }
  }
  if ((!attrs || (Array.isArray(attrs) && attrs.length === 0)) && item.productOptionsSnapshot) {
    let snapshot = item.productOptionsSnapshot;
    if (typeof snapshot === 'string') {
      try { snapshot = JSON.parse(snapshot); } catch { snapshot = {}; }
    }
    if (snapshot && typeof snapshot === 'object') {
      if (Array.isArray(snapshot.attributes) && snapshot.attributes.length > 0) {
        attrs = snapshot.attributes;
      } else if (typeof snapshot.attributes === 'string') {
        attrs = [snapshot.attributes];
      } else if (Array.isArray(snapshot.whccItemAttributeUIDs) && snapshot.whccItemAttributeUIDs.length > 0) {
        attrs = snapshot.whccItemAttributeUIDs;
      }
    }
  }
  if ((!attrs || (Array.isArray(attrs) && attrs.length === 0)) && item.attributes) {
    attrs = Array.isArray(item.attributes) ? item.attributes : [item.attributes];
  }
  return attrs && attrs.length ? attrs : undefined;
}

module.exports = { extractAttributesFromOrderItem };
