// Unit test for attribute extraction logic in server/routes/orders.js
// Run with: npx jest server/routes/orders.attributes.test.js

const { extractAttributesFromOrderItem } = require('./extractAttributes');

describe('Order Item Attribute Extraction', () => {
  it('should use whccItemAttributeUIDs if attributes is empty array', () => {
    const item = {
      productOptions: {},
      productOptionsSnapshot: {
        attributes: [],
        whccItemAttributeUIDs: [5, 7, 9]
      }
    };
    const attrs = extractAttributesFromOrderItem(item);
    expect(attrs).toEqual([5, 7, 9]);
  });

  it('should use attributes if non-empty', () => {
    const item = {
      productOptions: {},
      productOptionsSnapshot: {
        attributes: [42],
        whccItemAttributeUIDs: [5, 7, 9]
      }
    };
    const attrs = extractAttributesFromOrderItem(item);
    expect(attrs).toEqual([42]);
  });

  it('should use whccItemAttributeUIDs if attributes is missing', () => {
    const item = {
      productOptions: {},
      productOptionsSnapshot: {
        whccItemAttributeUIDs: [1, 2, 3]
      }
    };
    const attrs = extractAttributesFromOrderItem(item);
    expect(attrs).toEqual([1, 2, 3]);
  });

  it('should return undefined if neither present', () => {
    const item = {
      productOptions: {},
      productOptionsSnapshot: {}
    };
    const attrs = extractAttributesFromOrderItem(item);
    expect(attrs).toBeUndefined();
  });
});

// You must implement or export extractAttributesFromOrderItem from orders.js for this test to work.
