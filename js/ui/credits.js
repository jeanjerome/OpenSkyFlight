/**
 * Contributions listed in the Credits tab of the settings menu: the providers
 * of the data fetched at runtime, the 3D assets and the libraries. Each item
 * names the work, links to it and gives the attribution its licence asks for.
 */
export const CREDITS = [
  {
    group: 'Map data and imagery',
    items: [
      {
        name: 'OpenStreetMap',
        url: 'https://www.openstreetmap.org/copyright',
        credit: '© OpenStreetMap contributors. Road map tiles (CC BY-SA 2.0), map data under the ODbL',
      },
      {
        name: 'Esri World Imagery',
        url: 'https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9',
        credit:
          'Satellite imagery. Powered by Esri. Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      },
      {
        name: 'Terrain Tiles',
        url: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
        credit:
          'Elevation, courtesy of Mapzen, hosted by AWS: USGS 3DEP, SRTM, GMTED2010, ETOPO1 and others. ' +
          'EU-DEM produced using Copernicus data and information funded by the European Union',
      },
      {
        name: 'NASA Black Marble',
        url: 'https://earthobservatory.nasa.gov/features/NightLights',
        credit: 'City lights at night (VIIRS, 2016), courtesy of NASA Earth Observatory / NASA GIBS',
      },
      {
        name: 'OurAirports',
        url: 'https://ourairports.com/data/',
        credit: 'Airports and runways (public domain)',
      },
      {
        name: 'Nominatim',
        url: 'https://nominatim.openstreetmap.org/',
        credit: 'Place search. © OpenStreetMap contributors, data under the ODbL',
      },
    ],
  },
  {
    group: 'Aircraft',
    items: [
      {
        name: 'Dassault Rafale B',
        url: 'https://www.cgtrader.com/free-3d-models/aircraft/military-aircraft/dassault-rafale-b-bdc1590e-5936-4912-ba44-79f5c2e09f07',
        credit: '3D model by pjedvaj, CGTrader (royalty free)',
      },
      {
        name: "Armée de l'Air skins",
        url: 'https://files.digitalcombatsimulator.com/fr/files/3308088/',
        credit: 'Paint scheme by Aerojust for the Rafale mod of DCS World by Patrick56 (freeware)',
      },
    ],
  },
  {
    group: 'Software and fonts',
    items: [
      { name: 'Three.js', url: 'https://threejs.org/', credit: 'WebGPU rendering (MIT)' },
      { name: 'three-tile', url: 'https://github.com/sxguojf/three-tile', credit: 'Tile map engine by sxguojf (MIT)' },
      {
        name: 'three-geospatial',
        url: 'https://github.com/takram-design-engineering/three-geospatial',
        credit: 'Atmospheric scattering and volumetric clouds by takram (MIT)',
      },
      {
        name: 'Rajdhani',
        url: 'https://fonts.google.com/specimen/Rajdhani',
        credit: 'Typeface by the Indian Type Foundry (SIL Open Font License 1.1)',
      },
    ],
  },
];
