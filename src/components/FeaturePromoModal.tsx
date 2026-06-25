import React, { useState, useEffect } from 'react';
import './FeaturePromoModal.css';

const PROMO_KEY = 'featurePromoSeen_v1';

interface Props {
  onDismiss?: () => void;
  forceShow?: boolean;
}

const Slide1Scene: React.FC = () => (
  <div className="fpm-photo-grid">
    <div className="fpm-photo-cell" />
    <div className="fpm-photo-cell">
      <div className="fpm-heart">♥</div>
    </div>
    <div className="fpm-photo-cell">
      <div className="fpm-heart-outline">♡</div>
    </div>
    <div className="fpm-photo-cell" />
  </div>
);

const Slide2Scene: React.FC = () => (
  <div className="fpm-watch-scene">
    <div className="fpm-player-card">
      <div className="fpm-player-avatar">🏃</div>
      <div className="fpm-player-info">
        <div className="fpm-player-name">Jordan Smith</div>
        <div className="fpm-player-num">#23 · Varsity</div>
      </div>
      <div className="fpm-watch-btn">+ Watch</div>
    </div>
    <div className="fpm-notification">
      <span className="fpm-bell">🔔</span>
      <span className="fpm-notify-text">New photos found!</span>
    </div>
  </div>
);

const Slide3Scene: React.FC = () => (
  <div className="fpm-tag-scene">
    <div className="fpm-album-card">
      <div className="fpm-album-card-header">
        <div className="fpm-album-icon">📸</div>
        <div>
          <div className="fpm-album-title">Team Photos — Spring 2025</div>
          <div className="fpm-album-sub">48 photos</div>
        </div>
      </div>
      <div className="fpm-tag-btn-wrap">
        <div className="fpm-tag-btn">👤 Suggest a Player</div>
        <span className="fpm-cursor">👆</span>
      </div>
    </div>
    <div className="fpm-check">
      <div className="fpm-check-icon">✓</div>
      <span className="fpm-check-text">Tag submitted — studio will review!</span>
    </div>
  </div>
);

const SLIDES = [
  {
    key: 'favorites',
    scene: <Slide1Scene />,
    title: 'Save Your Favorites',
    desc: 'Tap the ♥ on any photo to save it. Email yourself a magic link to come back and order anytime.',
  },
  {
    key: 'watchlist',
    scene: <Slide2Scene />,
    title: 'Track Players & Schools',
    desc: 'Add players or schools to your watch list and get notified the moment new photos are published.',
  },
  {
    key: 'tag',
    scene: <Slide3Scene />,
    title: 'Spot Someone You Know?',
    desc: "Tag a player in an album and the studio will make sure they're tagged in all their photos going forward.",
  },
];

const FeaturePromoModal: React.FC<Props> = ({ onDismiss, forceShow }) => {
  const [slide, setSlide] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(PROMO_KEY)) {
      const t = setTimeout(() => setVisible(true), 900);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    if (forceShow) {
      setSlide(0);
      setVisible(true);
    }
  }, [forceShow]);

  const dismiss = () => {
    localStorage.setItem(PROMO_KEY, '1');
    setVisible(false);
    onDismiss?.();
  };

  const next = () => {
    if (slide < SLIDES.length - 1) setSlide(s => s + 1);
    else dismiss();
  };

  if (!visible) return null;

  return (
    <div className="fpm-overlay" onClick={e => { if (e.target === e.currentTarget) dismiss(); }}>
      <div className="fpm-modal">
        <div className="fpm-header">
          <span className="fpm-logo">✨ What's New</span>
          <button className="fpm-close" onClick={dismiss} aria-label="Close">×</button>
        </div>

        <div className="fpm-slides">
          {SLIDES.map((s, i) => (
            <div
              key={s.key}
              className={`fpm-slide ${i === slide ? 'active' : i < slide ? 'prev' : 'next'}`}
            >
              <div className="fpm-scene">{s.scene}</div>
              <div className="fpm-title">{s.title}</div>
              <p className="fpm-desc">{s.desc}</p>
            </div>
          ))}
        </div>

        <div className="fpm-footer">
          <div className="fpm-dots">
            {SLIDES.map((_, i) => (
              <div
                key={i}
                className={`fpm-dot${i === slide ? ' active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => setSlide(i)}
              />
            ))}
          </div>
          <div className="fpm-actions">
            {slide < SLIDES.length - 1 && (
              <button className="fpm-btn-skip" onClick={dismiss}>Skip</button>
            )}
            <button className="fpm-btn-next" onClick={next}>
              {slide < SLIDES.length - 1 ? 'Next →' : 'Get Started'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeaturePromoModal;
