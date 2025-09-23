import "../styles/Footer.css"
import pluteologo from "../images/pluteologo.svg";

const Footer = () => {
    return ( 
        <div className="footer">
            <img src={pluteologo} className="pluteologofooter"></img>

            <div className="rightsfooter">Everything on this webpage belongs to Pluteo. If you have any questions, contact us on pluteoinfo@gmail.com</div>

            <div className="socialmediafooter">
                <i className="fa-brands fa-instagram"></i>
                <i className="fa-brands fa-tiktok"></i>
            </div>
        </div>
     );
}
 
export default Footer;