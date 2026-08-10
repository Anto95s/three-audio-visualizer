import "./style/style.css";
import Visualizer from "../../components/Visualizer/Visualizer";

export default {
  render() {
    return `
    <div class="center-visualizer">
      ${Visualizer.render()}
    </div>
  `;
  },
  init() {
    Visualizer.init();
  }
}