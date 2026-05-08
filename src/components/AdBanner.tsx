import React, { useEffect } from 'react';

export default function AdBanner() {
  useEffect(() => {
    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (err) {
      console.error('Adsense error', err);
    }
  }, []);

  return (
    <div className="w-full my-8 overflow-hidden flex justify-center bg-gray-50 border-t border-b border-gray-200 py-4">
      <ins className="adsbygoogle w-full"
           style={{ display: 'block' }}
           data-ad-format="fluid"
           data-ad-layout-key="+2g+pn+50+b-4o"
           data-ad-client="ca-pub-5738943819550045"
           data-ad-slot="5585498316"></ins>
    </div>
  );
}
