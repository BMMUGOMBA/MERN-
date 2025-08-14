import profilePic from './assets/batsi.jpg';

function Card(){

    return (
        <div className="card"> 
            <img className="card-image" src={profilePic} alt="Profile Picture"></img>
            <h2 className="card-title">Prof Batsi</h2>
            <p className="card-text">Here Comes the Crazy One the Misfit.</p>
        </div>
    )

}

export default Card