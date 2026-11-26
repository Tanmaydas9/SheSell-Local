/* ------------------------------------------------------------------
   Catalogue: 20 listings across the deck's four categories, sold by
   individual women and Self-Help Groups (SHGs) in rural Pune district
   and its neighbouring districts (the pilot area).
   lead = seller-set availability / lead time (see LEADS below).
   perish = perishability 0..1, pop = local popularity 0..1,
   fest = festival affinity 0..1 (all feed the content vector).
------------------------------------------------------------------- */
const CATALOG = (() => {
  const P = (id, cat, art, price, en, mr, unitEn, unitMr, sellerEn, sellerMr, type, placeEn, placeMr, descEn, descMr, perish, pop, fest) =>
    ({ id, cat, art, price, name: { en, mr }, unit: { en: unitEn, mr: unitMr }, seller: { en: sellerEn, mr: sellerMr }, type,
       place: { en: placeEn, mr: placeMr }, desc: { en: descEn, mr: descMr }, perish, pop, fest });
  const items = [
    P('p01', 'food', 'chakli', 120, 'Bhajani Chakli', 'भाजणीची चकली', '250 g', '२५० ग्रॅम', 'Sunita Pawar', 'सुनीता पवार', 'individual', 'Junnar, Pune', 'जुन्नर, पुणे',
      'Crunchy spiral chakli made from roasted multigrain bhajani flour, fried fresh in small batches.', 'भाजलेल्या बहुधान्य भाजणीपासून बनवलेली कुरकुरीत चकली, थोड्या-थोड्या प्रमाणात ताजी तळलेली.', 0.45, 0.92, 0.95),
    P('p02', 'food', 'ladoo', 220, 'Besan Ladoo', 'बेसन लाडू', '500 g', '५०० ग्रॅम', 'Annapurna Mahila Bachat Gat', 'अन्नपूर्णा महिला बचत गट', 'shg', 'Wai, Satara', 'वाई, सातारा',
      'Slow-roasted gram flour, pure ghee and cardamom, made by 12 women of the Annapurna SHG.', 'मंद आचेवर भाजलेले बेसन, शुद्ध तूप आणि वेलची; अन्नपूर्णा बचत गटातील १२ महिलांनी बनवलेले.', 0.4, 0.8, 0.9),
    P('p03', 'food', 'pickle', 160, 'Raw Mango Pickle', 'कैरीचे लोणचे', '400 g jar', '४०० ग्रॅम बरणी', 'Rukmini Jadhav', 'रुक्मिणी जाधव', 'individual', 'Mangaon, Raigad', 'माणगाव, रायगड',
      'Konkan raw mango pickle cured in cold-pressed groundnut oil with homemade masala.', 'शेंगदाणा तेल आणि घरगुती मसाल्यात मुरवलेले कोकणातील कैरीचे लोणचे.', 0.15, 0.7, 0.3),
    P('p04', 'food', 'poli', 140, 'Puran Poli', 'पुरणपोळी', 'Pack of 4', '४ नग', 'Sakhi Mahila Bachat Gat', 'सखी महिला बचत गट', 'shg', 'Baramati, Pune', 'बारामती, पुणे',
      'Soft chana-dal and jaggery stuffed flatbread, made to order. Best with a spoon of ghee.', 'हरभरा डाळ आणि गुळाचे पुरण भरलेली मऊ पुरणपोळी, ऑर्डरनुसार ताजी. तुपासोबत उत्तम.', 0.85, 0.75, 0.8),
    P('p05', 'food', 'papad', 90, 'Nachni Papad', 'नाचणी पापड', '200 g', '२०० ग्रॅम', 'Jijau Mahila Bachat Gat', 'जिजाऊ महिला बचत गट', 'shg', 'Bhor, Pune', 'भोर, पुणे',
      'Sun-dried finger-millet papad: light, crunchy and rich in calcium.', 'उन्हात वाळवलेले नाचणीचे पापड: हलके, कुरकुरीत आणि कॅल्शियमने भरपूर.', 0.1, 0.55, 0.4),
    P('p06', 'tailoring', 'blouse', 450, 'Tailored Blouse, Paithani Border', 'पैठणी काठाचे शिवलेले ब्लाउज', 'Custom fit', 'मापानुसार', 'Meena Shinde', 'मीना शिंदे', 'individual', 'Rajgurunagar, Pune', 'राजगुरुनगर, पुणे',
      'Blouse stitched to your measurements with a Paithani border, lining and hooks. Ready in 3 days.', 'तुमच्या मापानुसार पैठणी काठाचे ब्लाउज, अस्तर आणि हुकसह. ३ दिवसांत तयार.', 0, 0.85, 0.75),
    P('p07', 'tailoring', 'kurti', 650, 'Block-Print Cotton Kurti', 'ब्लॉक-प्रिंट सुती कुर्ती', 'Custom fit', 'मापानुसार', 'Savitribai Phule Mahila Bachat Gat', 'सावित्रीबाई फुले महिला बचत गट', 'shg', 'Daund, Pune', 'दौंड, पुणे',
      'Block-printed cotton kurti with side pockets, stitched at the SHG tailoring unit.', 'बाजूला खिसे असलेली ब्लॉक-प्रिंट सुती कुर्ती, बचत गटाच्या शिलाई केंद्रात शिवलेली.', 0, 0.7, 0.55),
    P('p08', 'tailoring', 'saree', 80, 'Saree Fall & Pico', 'साडी फॉल आणि पिको', 'Per saree', 'प्रति साडी', 'Lata More', 'लता मोरे', 'individual', 'Shirur, Pune', 'शिरूर, पुणे',
      'Fall stitching and pico edging for any saree, with doorstep pickup in Shirur town.', 'कोणत्याही साडीला फॉल आणि पिको; शिरूर शहरात घरून साडी नेण्याची सोय.', 0, 0.8, 0.6),
    P('p09', 'tailoring', 'nauvari', 900, 'Nauvari Saree Stitching', 'नऊवारी साडी शिलाई', 'Ready-to-wear', 'तयार नेसण्याजोगी', 'Navdurga Mahila Bachat Gat', 'नवदुर्गा महिला बचत गट', 'shg', 'Mulshi, Pune', 'मुळशी, पुणे',
      'Your nine-yard saree stitched into an easy ready-to-wear nauvari with traditional pleats.', 'तुमची नऊवारी साडी पारंपरिक निऱ्यांसह सहज नेसता येईल अशी शिवून.', 0, 0.6, 0.85),
    P('p10', 'tailoring', 'frock', 380, 'Parkar-Polka for Girls', 'मुलींसाठी परकर-पोलकं', 'Ages 2–8', 'वय २–८ वर्षे', 'Asha Kamble', 'आशा कांबळे', 'individual', 'Malshiras, Solapur', 'माळशिरस, सोलापूर',
      'Traditional silk-blend parkar-polka for little girls, stitched to an age-wise size chart.', 'लहान मुलींसाठी पारंपरिक परकर-पोलकं, वयानुसार मापात शिवलेले.', 0, 0.65, 0.9),
    P('p11', 'craft', 'bag', 350, 'Handloom Tote Bag', 'हातमागाची पिशवी', '1 piece', '१ नग', 'Rangoli Handloom Bachat Gat', 'रांगोळी हातमाग बचत गट', 'shg', 'Mohol, Solapur', 'मोहोळ, सोलापूर',
      'Sturdy handwoven cotton tote with a lined inner pocket, woven on pit looms.', 'आतून खिसा असलेली, खड्डा-मागावर विणलेली मजबूत सुती पिशवी.', 0, 0.78, 0.5),
    P('p12', 'craft', 'warli', 600, 'Warli Painting, A3', 'वारली चित्र, A3', 'A3 canvas', 'A3 कॅनव्हास', 'Kamal Wangad', 'कमल वांगड', 'individual', 'Murbad, Thane', 'मुरबाड, ठाणे',
      'Hand-painted Warli tarpa-dance scene in rice-paste white on earth-red canvas.', 'गेरू रंगाच्या कॅनव्हासवर तांदळाच्या पांढऱ्या रंगात हाताने काढलेले वारली तारपा नृत्य.', 0, 0.6, 0.45),
    P('p13', 'craft', 'diya', 180, 'Terracotta Diya Set', 'मातीच्या पणत्या', 'Set of 12', '१२ नग', 'Vithai Kumbhar Bachat Gat', 'विठाई कुंभार बचत गट', 'shg', 'Pandharpur, Solapur', 'पंढरपूर, सोलापूर',
      'Wheel-thrown clay diyas, kiln-fired and painted in festive colours.', 'चाकावर घडवलेल्या, भट्टीत भाजलेल्या आणि सणासाठी रंगवलेल्या मातीच्या पणत्या.', 0.05, 0.88, 1),
    P('p14', 'craft', 'basket', 250, 'Bamboo Basket', 'बांबूची टोपली', 'Medium', 'मध्यम', 'Bhimashankar Bamboo Craft Bachat Gat', 'भीमाशंकर बांबू हस्तकला बचत गट', 'shg', 'Ambegaon, Pune', 'आंबेगाव, पुणे',
      'Hand-split bamboo basket woven by tribal women artisans of the Bhimashankar hills. Strong and food-safe.', 'भीमाशंकर डोंगररांगेतील आदिवासी कारागीर महिलांनी विणलेली मजबूत बांबूची टोपली.', 0, 0.5, 0.35),
    P('p15', 'craft', 'toran', 320, 'Bead & Mirror Toran', 'मणी-आरसे तोरण', '36 inch', '३६ इंच', 'Pooja Gaikwad', 'पूजा गायकवाड', 'individual', 'Sangamner, Ahilyanagar', 'संगमनेर, अहिल्यानगर',
      'Hand-strung bead and mirror-work door toran for Diwali, Gudi Padwa and housewarmings.', 'दिवाळी, गुढीपाडवा आणि गृहप्रवेशासाठी हाताने ओवलेले मणी-आरसे तोरण.', 0, 0.72, 0.95),
    P('p16', 'agri', 'veg', 60, 'Fresh Produce Basket', 'ताज्या भाज्यांची टोपली', '1 kg seasonal', '१ किलो हंगामी', 'Krishi Sakhi Shetkari Gat', 'कृषी सखी शेतकरी गट', 'shg', 'Narayangaon, Pune', 'नारायणगाव, पुणे',
      'Same-day harvested tomato, brinjal and methi, straight from women farmers.', 'त्याच दिवशी काढलेले टोमॅटो, वांगी आणि मेथी, थेट शेतकरी महिलांकडून.', 1, 0.95, 0.2),
    P('p17', 'agri', 'pomegranate', 150, 'Sangola Pomegranates', 'सांगोल्याची डाळिंबे', '1 kg', '१ किलो', 'Shobha Kale', 'शोभा काळे', 'individual', 'Sangola, Solapur', 'सांगोला, सोलापूर',
      'Ruby-red Bhagwa pomegranates picked ripe from a family orchard in Sangola.', 'सांगोल्यातील कौटुंबिक बागेतून पिकल्यावर तोडलेली लालबुंद भगवा डाळिंबे.', 0.6, 0.82, 0.35),
    P('p18', 'agri', 'jaggery', 110, 'Organic Jaggery', 'सेंद्रिय गूळ', '1 kg', '१ किलो', 'Bhima Mahila Shetkari Gat', 'भीमा महिला शेतकरी गट', 'shg', 'Indapur, Pune', 'इंदापूर, पुणे',
      'Chemical-free jaggery from organically grown sugarcane on the banks of the Bhima.', 'भीमा नदीकाठच्या सेंद्रिय उसापासून बनवलेला रसायनमुक्त गूळ.', 0.1, 0.7, 0.7),
    P('p19', 'agri', 'banana', 55, 'Farm Bananas', 'शेतातील केळी', '1 dozen', '१ डझन', 'Sarala Patil', 'सरला पाटील', 'individual', 'Baramati, Pune', 'बारामती, पुणे',
      'Naturally ripened bananas from a family farm near Baramati. No carbide, picked for flavour.', 'बारामतीजवळच्या कौटुंबिक शेतातील नैसर्गिकरित्या पिकवलेली केळी. कार्बाइड नाही.', 0.9, 0.85, 0.25),
    P('p20', 'agri', 'rice', 180, 'Indrayani Rice', 'इंद्रायणी तांदूळ', '2 kg', '२ किलो', 'Maval Mahila Shetkari Gat', 'मावळ महिला शेतकरी गट', 'shg', 'Vadgaon Maval, Pune', 'वडगाव मावळ, पुणे',
      'Fragrant, sticky Indrayani rice from the rain-fed fields of Maval.', 'मावळच्या पावसाळी शेतातील सुगंधी, चिकट इंद्रायणी तांदूळ.', 0.05, 0.68, 0.3)
  ];
  // Availability and lead time, set by each seller: slow-made and local, not 10-minute dark-store delivery.
  const LEADS = ['fresh_today', 'small_batch', 'harvest_same_day', 'made_to_order', 'custom_fit', 'ready_stock', 'preorder', 'custom'];
  const DEFAULT_LEAD = { food: 'fresh_today', tailoring: 'custom_fit', craft: 'made_to_order', agri: 'harvest_same_day' };
  const LEAD = {
    p01: 'fresh_today', p02: 'small_batch', p03: 'ready_stock', p05: 'ready_stock', p06: 'custom_fit', p07: 'custom_fit', p09: 'custom_fit',
    p10: 'made_to_order', p11: 'ready_stock', p12: 'preorder', p13: 'small_batch', p14: 'made_to_order', p15: 'made_to_order',
    p16: 'harvest_same_day', p17: 'harvest_same_day', p18: 'ready_stock', p20: 'ready_stock',
    p04: ['Made fresh to order · next morning', 'ऑर्डरनुसार ताजी · दुसऱ्या दिवशी सकाळी'],
    p08: ['Doorstep pickup · back in 2 days', 'घरून साडी नेणार · २ दिवसांत परत'],
    p19: ['Naturally ripened · order a day ahead', 'नैसर्गिक पिकवलेली · एक दिवस आधी ऑर्डर करा']
  };
  items.forEach(p => {
    const l = LEAD[p.id] || DEFAULT_LEAD[p.cat];
    if (Array.isArray(l)) { p.lead = 'custom'; p.leadText = { en: l[0], mr: l[1] }; } else p.lead = l;
  });
  // Historical co-purchase "baskets" (seeded) for item-based collaborative filtering.
  const ARCHETYPES = [
    { w: 0.18, items: ['p01', 'p02', 'p13', 'p15', 'p18'] },          // Diwali faral + decor
    { w: 0.24, items: ['p16', 'p19', 'p17', 'p18', 'p20', 'p05'] },   // weekly kitchen
    { w: 0.14, items: ['p06', 'p08', 'p09', 'p11'] },                 // wedding / occasion tailoring
    { w: 0.12, items: ['p12', 'p11', 'p14', 'p02'] },                 // gifting
    { w: 0.15, items: ['p01', 'p05', 'p03', 'p04'] },                 // tea-time snacks
    { w: 0.10, items: ['p10', 'p19', 'p01', 'p07'] },                 // kids & family
    { w: 0.07, items: [] }                                            // random one-offs
  ];
  function baskets(n = 260, seed = 77) {
    const r = DATAGEN.rng(seed), ids = items.map(p => p.id), out = [];
    for (let i = 0; i < n; i++) {
      let u = r(), acc = 0, a = ARCHETYPES[ARCHETYPES.length - 1];
      for (const A of ARCHETYPES) { acc += A.w; if (u < acc) { a = A; break; } }
      const b = new Set();
      a.items.forEach(id => { if (r() < 0.55) b.add(id); });
      if (r() < 0.18 || b.size === 0) b.add(ids[Math.floor(r() * ids.length)]);
      if (b.size === 1 && a.items.length && r() < 0.6) b.add(a.items[Math.floor(r() * a.items.length)]);
      out.push([...b]);
    }
    return out;
  }
  return { items, baskets, LEADS, DEFAULT_LEAD };
})();
