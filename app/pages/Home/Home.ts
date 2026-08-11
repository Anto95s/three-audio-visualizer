import "./style/style.css";
import MusicSelector from "../../components/MusicSelector/MusicSelector";
import Visualizer from "../../components/Visualizer/Visualizer";

export default {
  render() {
    return `
      ${Visualizer.render()}
      ${MusicSelector.render()}
    `;
  },
  init() {
    Visualizer.init();
    MusicSelector.init();
  }
}