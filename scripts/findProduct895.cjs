const axios = require('axios');

(async () => {
  try {
    // Get auth token
    const tokenRes = await axios.post('https://sandbox.apps.whcc.com/oauth/authorize', {
      client_id: process.env.WHCC_CLIENT_ID,
      client_secret: process.env.WHCC_CLIENT_SECRET,
      grant_type: 'client_credentials'
    });
    const token = tokenRes.data.access_token;
    
    // Fetch catalog
    const catalogRes = await axios.get('https://sandbox.apps.whcc.com/api/graphql', {
      params: { query: `{ catalog { categories { id name productList { id productId name description defaultItemAttributes { id } productNodes { dp2NodeId } attributeCategories { id name requiredLevel attributes { id name } } } } } }` },
      headers: { Authorization: `Bearer ${token}` }
    });

    const catalog = catalogRes.data.data?.catalog;
    if (!catalog) {
      console.log('No catalog found');
      return;
    }

    // Search for product UID 895
    console.log('Searching for product with UID/ID 895...\n');
    
    let found = false;
    for (const category of catalog.categories) {
      for (const product of category.productList) {
        const productId = Number(product.id ?? product.productId);
        if (productId === 895) {
          found = true;
          console.log(`✓ Found Product ${productId} in category: ${category.name}`);
          console.log(`  Name: ${product.name}`);
          console.log(`  Description: ${product.description}`);
          console.log(`\n  AttributeCategories:`);
          
          if (Array.isArray(product.attributeCategories)) {
            for (const attrCat of product.attributeCategories) {
              console.log(`    - ${attrCat.name} (ID: ${attrCat.id}, Required: ${attrCat.requiredLevel})`);
              if (Array.isArray(attrCat.attributes)) {
                for (const attr of attrCat.attributes) {
                  console.log(`      * ${attr.name} (ID: ${attr.id})`);
                }
              }
            }
          }
          
          console.log(`\n  Default Item Attributes:`);
          if (Array.isArray(product.defaultItemAttributes)) {
            product.defaultItemAttributes.forEach(attr => console.log(`    - ID: ${attr.id}`));
          } else {
            console.log(`    - None`);
          }
          
          console.log(`\n  Product Nodes:`);
          if (Array.isArray(product.productNodes)) {
            product.productNodes.forEach((node, idx) => console.log(`    - Node ${idx}: DP2NodeID ${node.dp2NodeId}`));
          }
        }
      }
    }
    
    if (!found) {
      console.log('Product 895 not found. Showing similar product sizes:');
      for (const category of catalog.categories) {
        for (const product of category.productList) {
          if (product.name && product.name.includes('12x36')) {
            const productId = Number(product.id ?? product.productId);
            console.log(`  Found ${product.name} (ID: ${productId})`);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    process.exit(1);
  }
})();
