import { CartItem, DownloadUrl } from '../types';

export const downloadService = {
  generateDownloadUrls(items: CartItem[]): DownloadUrl[] {
    const urls: DownloadUrl[] = [];
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiry

    items.forEach(item => {
      if (item.productId) {
        const uniqueId = Math.random().toString(36).substring(2, 15);
        const url = `${window.location.origin}/api/downloads/${uniqueId}/${item.photoId}`;
        
        urls.push({
          photoId: item.photoId,
          productId: item.productId,
          url,
          expiresAt: expiresAt.toISOString(),
          downloads: 0,
          maxDownloads: 5, // Allow 5 downloads
        });
      }
    });

    return urls;
  },

  async sendDownloadEmail(
    userEmail: string,
    downloadUrls: DownloadUrl[],
    orderNumber: string
  ): Promise<void> {
    // In a real implementation, this would call a backend API to send the email
    console.log('Sending download email to:', userEmail);
    console.log('Order number:', orderNumber);
    console.log('Download URLs:', downloadUrls);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // For demo purposes, show a message
    const urlList = downloadUrls.map(d => `Photo ID ${d.photoId}: ${d.url}`).join('\n');
    console.log(`
========================================
EMAIL SENT TO: ${userEmail}
ORDER: ${orderNumber}
========================================

Thank you for your purchase!

Your digital downloads are ready:

${urlList}

Download links expire on: ${new Date(downloadUrls[0]?.expiresAt).toLocaleDateString()}
Maximum downloads per link: ${downloadUrls[0]?.maxDownloads}

Questions? Contact support@photolab.com

========================================
    `);
  },
};
