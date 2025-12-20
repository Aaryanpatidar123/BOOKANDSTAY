// Simple keyword-based category classifier
// Returns one of the categories defined in Listing schema, or 'Trending' as default

function classifyCategory(text){
    if(!text) return 'Trending';
    const s = text.toLowerCase();
    const categories = [
        {name:'Rooms', keywords:[' room','bedroom','beds','studio','apartment','suite']},
        {name:'Iconic Cities', keywords:[' city','downtown','metropolitan','urban','city center','landmark']},
        {name:'Mountains', keywords:[' mountain','hike','peak','alpine','summit','ski']},
        {name:'Castles', keywords:[' castle','fort','palace']},
        {name:'Camping', keywords:[' camp','camping','tent','outdoor','campground','trek']},
        {name:'Farms', keywords:[' farm','barn','countryside','ranch','agri']},
        {name:'Arctic', keywords:[' snow','arctic','igloo','polar','ice','northern lights','glacier']},
    ];

    const scores = {};
    for(const cat of categories){
        scores[cat.name]=0;
        for(const kw of cat.keywords){
            if(s.includes(kw)) scores[cat.name]++;
        }
    }

    const sorted = Object.entries(scores).sort((a,b)=>b[1]-a[1]);
    if(sorted.length && sorted[0][1] > 0) return sorted[0][0];
    return 'Trending';
}

module.exports = { classifyCategory };