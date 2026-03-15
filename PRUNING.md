# Analyse des mécanismes d'éviction de geo-three

## Contexte

Recherche informative pour comprendre comment geo-three gère le cycle de vie des tuiles, après suppression du code d'éviction custom (inopérant) de ChunkManager.

## Résultat : aucune action requise

L'analyse de la documentation geo-three et de son utilisation dans le projet confirme que :

1. **geo-three gère l'éviction par LOD** : `simplify()` dans `MapNode` dispose les tuiles (matériau, texture GPU, géométrie) quand la caméra s'éloigne
2. **`cacheTiles = false`** (défaut, non modifié dans le projet) → les tuiles sont bien libérées
3. **Aucun cap sur le nombre de tuiles** n'existe dans geo-three — le nombre est borné indirectement par les thresholds LOD et le zoom max
4. **Configuration actuelle** : `LODRaycast` avec 11 rays, `thresholdUp=0.6`, `thresholdDown=0.15`, zoom max 15/18

**Décision** : pas d'implémentation supplémentaire nécessaire pour le moment.
