/* Public demonstration of address lookup only. No private app modules or planning logic. */
/* global L */
'use strict';
window.DemoLocation = (() => {
  let disposeCurrent = () => {};
  let draft = { address: '', latitude: '', longitude: '' };
  const cache = new Map();
  const valid = (lat, lng) => lat != null && lng != null && lat !== '' && lng !== '' && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;
  function mount(root) {
    disposeCurrent();
    root.innerHTML = `<h2>Find a property on the map</h2><p>Enter a UK address or postcode. Coordinates fill automatically; drag the pin to the entrance or click the map.</p><p class="hint">Try a public landmark or sample address. The address is sent to Photon for lookup. The commercial examples below stay fixed when you move the pin.</p><div class="location-search"><label>Property address<input id="demo-address" autocomplete="off" maxlength="400" placeholder="Street, town and postcode"></label><button class="button secondary" id="find-address" type="button">Find address</button></div><button class="text-button" id="sample-address" type="button">Try Oxford Town Hall as an example</button><p id="location-status" role="status" aria-live="polite"></p><label id="match-field" hidden>Matching locations<select id="location-matches"></select></label><div class="grid coordinate-fields"><label>Latitude<input id="demo-latitude" type="number" min="-90" max="90" step="any"></label><label>Longitude<input id="demo-longitude" type="number" min="-180" max="180" step="any"></label></div><div id="demo-map" aria-label="Property reference map" hidden></div><p id="map-placeholder" class="hint">Your reference map will appear here. You can also enter coordinates manually.</p><p class="image-label">Search by <a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">Photon</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>. Matches may be approximate; check the property entrance.</p>`;
    const get = (selector) => root.querySelector(selector);
    const address = get('#demo-address'), lat = get('#demo-latitude'), lng = get('#demo-longitude'), status = get('#location-status'), button = get('#find-address'), select = get('#location-matches');
    let generation = 0, controller, timer, map, marker, hits = [];
    const cancel = () => { generation++; clearTimeout(timer); controller?.abort(); button.disabled = false; };
    const removeMap = () => { map?.remove(); map = null; marker = null; get('#demo-map').hidden = true; get('#map-placeholder').hidden = false; };
    const setPin = (latitude, longitude, manual = false) => {
      if (!valid(latitude, longitude)) return;
      lat.value = Number(latitude).toFixed(6); lng.value = Number(longitude).toFixed(6);
      if (manual) { cancel(); select.value = ''; status.textContent = 'Pin adjusted. The coordinates now mark your chosen position. Prepared commercial figures remain unchanged.'; }
      if (!window.L) { status.textContent = 'The map could not load. Coordinates are still available for manual review.'; return; }
      if (!map) {
        get('#demo-map').hidden = false; get('#map-placeholder').hidden = true;
        map = L.map(get('#demo-map'), { scrollWheelZoom: false }).setView([Number(lat.value), Number(lng.value)], 17);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
        marker = L.marker([Number(lat.value), Number(lng.value)], { draggable: true, title: 'Property entrance pin', icon: L.divIcon({ className: 'entrance-pin', iconSize: [22,22], iconAnchor: [11,11] }) }).addTo(map);
        const move = (point) => setPin(point.lat, ((point.lng + 180) % 360 + 360) % 360 - 180, true);
        marker.on('dragend', () => move(marker.getLatLng()));
        map.on('click', (event) => move(event.latlng));
      } else { marker.setLatLng([Number(lat.value), Number(lng.value)]); map.panTo([Number(lat.value), Number(lng.value)]); }
    };
    const search = async () => {
      cancel(); const id = generation, query = address.value.trim().replace(/\s+/g, ' ');
      if (query.length < 5) { status.textContent = 'Enter a street, town or full postcode first.'; return; }
      controller = new AbortController(); const activeController = controller;
      const timeout = setTimeout(() => activeController.abort(), 12000);
      button.disabled = true; status.textContent = 'Finding the property…';
      try {
        let results = cache.get(query.toLowerCase());
        if (!results) {
          const url = new URL('https://photon.komoot.io/api/');
          url.search = new URLSearchParams({ q: query, limit: '5', lang: 'en', bbox: '-8.7,49.8,2,60.9' }).toString();
          const response = await fetch(url, { signal: activeController.signal });
          if (!response.ok) throw new Error('Lookup is temporarily unavailable. Retry shortly or enter coordinates manually.');
          const data = await response.json();
          results = (Array.isArray(data.features) ? data.features : []).flatMap((feature) => {
            const [longitude, latitude] = feature.geometry?.coordinates || [], p = feature.properties || {};
            if (feature.geometry?.type !== 'Point' || !valid(latitude, longitude)) return [];
            const label = [...new Set([p.name, [p.housenumber,p.street].filter(Boolean).join(' '), p.city || p.town || p.village, p.postcode, p.country].filter(Boolean))].join(', ');
            return label ? [{ latitude, longitude, label }] : [];
          });
          if (cache.size >= 30) cache.delete(cache.keys().next().value);
          cache.set(query.toLowerCase(), results);
        }
        if (id !== generation) return;
        hits = results; select.replaceChildren(new Option('Pin adjusted manually', ''));
        hits.forEach((hit, i) => select.add(new Option(hit.label, String(i))));
        get('#match-field').hidden = hits.length < 2;
        if (!hits.length) { status.textContent = 'No match found. Try the town and postcode, or enter coordinates manually.'; return; }
        select.value = '0'; setPin(hits[0].latitude, hits[0].longitude);
        status.textContent = `Suggested match: ${hits[0].label}. Check the map and move the pin to the correct entrance.`;
      } catch (error) { if (id === generation) status.textContent = error.name === 'AbortError' ? 'Address lookup timed out. Retry or enter coordinates manually.' : error.message; }
      finally { clearTimeout(timeout); if (id === generation) button.disabled = false; }
    };
    address.oninput = () => { cancel(); lat.value = ''; lng.value = ''; removeMap(); get('#match-field').hidden = true; status.textContent = ''; if (address.value.trim().length >= 5) timer = setTimeout(search, 1100); };
    address.onkeydown = (event) => { if (event.key === 'Enter') { event.preventDefault(); search(); } };
    button.onclick = search;
    get('#sample-address').onclick = () => { address.value = 'Oxford Town Hall, St Aldates, Oxford OX1 1BX'; address.oninput(); search(); };
    select.onchange = () => { const hit = hits[Number(select.value)]; if (select.value !== '' && hit) { cancel(); setPin(hit.latitude, hit.longitude); status.textContent = `${hit.label}. Check the entrance on the map.`; } };
    const manual = () => { cancel(); if (valid(lat.value, lng.value)) setPin(lat.value, lng.value, true); else { removeMap(); status.textContent = 'Enter valid latitude and longitude to show the map.'; } };
    lat.onchange = manual; lng.onchange = manual;
    lat.oninput = cancel; lng.oninput = cancel;
    address.value = draft.address; lat.value = draft.latitude; lng.value = draft.longitude;
    if (valid(lat.value, lng.value)) { setPin(lat.value, lng.value); status.textContent = 'Your selected location is retained. The commercial comparisons remain prepared examples.'; }
    disposeCurrent = () => { draft = { address: address.value, latitude: lat.value, longitude: lng.value }; cancel(); map?.remove(); map = null; };
  }
  return { mount, dispose: () => disposeCurrent(), reset: () => { disposeCurrent(); disposeCurrent = () => {}; draft = { address: '', latitude: '', longitude: '' }; } };
})();
