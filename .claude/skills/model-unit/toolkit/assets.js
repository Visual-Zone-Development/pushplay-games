// Every unit model by id, for viewer.html and the model-unit / edit-asset / animate-unit skills.
// Use "<group>.<unit>" ids. assetTeam picks the team colour the viewer dresses each asset in.
import { orcGrunt } from './models/orc-grunt.js'

export const ASSETS = {
  'orc.grunt': orcGrunt()
}
export const assetTeam = (id) => 'red'
